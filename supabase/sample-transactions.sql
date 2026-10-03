-- ════════════════════════════════════════════════════════════════════
-- Kosh MFS — sample transactions between the seed.sql accounts ONLY.
-- Run once in the Supabase SQL Editor (after schema.sql and seed.sql).
--
-- No users are created, and no outside party (bank, biller, other person)
-- appears. Every transaction is between these accounts, by their roles:
--
--   Sabbir_Tele (AGENT)   → Ashraful Islam (PERSONAL)   Cash In
--   Ashraful Islam        → Sabbir_Tele                 Cash Out (1.85% fee)
--   Ashraful Islam        → Nafiztong (MERCHANT)        Merchant payment (1.5% merchant fee)
--   Nafiztong             → Ashraful Islam              Refund (now and then)
--
-- The admin has no wallet, so takes no part.
--
-- Opening float: Cash In spends the agent's e-money, and Sabbir_Tele starts
-- with none. This script gives him an opening e-money float of ৳30,000 (like
-- the ৳50,000 opening cash in seed.sql). Everything after that is real
-- history: fees and agent commissions use the app's rates, wallets and the
-- agent's cash are updated with each transaction, and a transaction is
-- skipped if the payer can't afford it — no balance ever goes negative.
-- Existing balances and transactions are kept; this is added on top.
-- ════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if exists (select 1 from transactions where id like 'txn_smp_%') then
    raise exception 'Sample transactions were already added — this script only runs once.';
  end if;
  if (select count(*) from wallets where user_id in ('usr_ashraful', 'usr_sabbir_tele', 'usr_nafiztong')) <> 3 then
    raise exception 'Run seed.sql first: the starting accounts are missing.';
  end if;
end $$;

create temp sequence smp_seq;

-- Public transaction reference, e.g. K7Q2M9XA4D (same alphabet as the app: no 0/O/1/I).
create function pg_temp.trx_id() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 10)
$$;

-- Random amount in paisa between lo and hi taka, rounded to `step` taka.
create function pg_temp.tk(lo numeric, hi numeric, step int default 10) returns bigint language sql volatile as $$
  select (greatest(step, round((lo + random() * (hi - lo)) / step) * step) * 100)::bigint
$$;

-- Random time on a given day, between 08:00 and 22:00 Bangladesh time.
create function pg_temp.at_on(day date) returns timestamptz language sql volatile as $$
  select (day::timestamp + make_interval(secs => (8 + random() * 14) * 3600)) at time zone 'Asia/Dhaka'
$$;

-- Posts one successful transaction the way the app's ledger does.
-- Returns its trx_id, or null if skipped because the payer can't afford it.
create function pg_temp.post(
  p_type transaction_type, p_amount bigint, p_at timestamptz, p_desc text,
  s_uid text, s_name text, s_acct text, s_kind party_kind,
  r_uid text, r_name text, r_acct text, r_kind party_kind,
  p_sfee bigint default 0, p_rfee bigint default 0,
  c_uid text default null, c_amt bigint default null,
  cash_uid text default null, cash_delta bigint default null,
  p_method payment_method default null, p_related text default null
) returns text language plpgsql as $$
declare
  v_n bigint := nextval('smp_seq');
  v_trx text := pg_temp.trx_id();
begin
  if (select available from wallets where user_id = s_uid) < p_amount + p_sfee then
    return null;
  end if;
  if cash_uid is not null and coalesce((select cash_in_hand from wallets where user_id = cash_uid), 0) + cash_delta < 0 then
    return null;
  end if;

  update wallets set available = available - (p_amount + p_sfee), version = version + 1, updated_at = now() where user_id = s_uid;
  update wallets set available = available + (p_amount - p_rfee), version = version + 1, updated_at = now() where user_id = r_uid;
  if c_uid is not null and c_amt > 0 then
    update wallets set available = available + c_amt, version = version + 1, updated_at = now() where user_id = c_uid;
  end if;
  if cash_uid is not null then
    update wallets set cash_in_hand = coalesce(cash_in_hand, 0) + cash_delta, version = version + 1, updated_at = now() where user_id = cash_uid;
  end if;

  insert into transactions (
    id, trx_id, type, status, amount, sender_fee, receiver_fee,
    sender_user_id, sender_name, sender_account, sender_kind,
    receiver_user_id, receiver_name, receiver_account, receiver_kind,
    description, payment_method, related_trx_id,
    commission_user_id, commission_amount, cash_effect_user_id, cash_effect_delta,
    created_at, completed_at
  ) values (
    'txn_smp_' || v_n, v_trx, p_type, 'SUCCESSFUL', p_amount, p_sfee, p_rfee,
    s_uid, s_name, s_acct, s_kind,
    r_uid, r_name, r_acct, r_kind,
    p_desc, p_method, p_related,
    case when c_amt > 0 then c_uid end, case when c_amt > 0 then c_amt end,
    cash_uid, cash_delta,
    p_at, p_at
  );

  if c_uid is not null and c_amt > 0 then
    insert into commissions (id, agent_id, trx_id, type, base_amount, amount, created_at)
    values ('com_smp_' || v_n, c_uid, v_trx, p_type, p_amount, c_amt, p_at);
  end if;
  return v_trx;
end $$;

do $$
declare
  -- The seed.sql accounts, by role.
  ash constant text := 'usr_ashraful';    ash_no constant text := '01700000001';  -- PERSONAL
  sab constant text := 'usr_sabbir_tele'; sab_no constant text := '01814557644';  -- AGENT
  naf constant text := 'usr_nafiztong';   naf_id constant text := 'MR-40001';     -- MERCHANT
  d int; day date; at timestamptz; amt bigint; refund_amt bigint; i int; t text;
begin
  perform setseed(0.2026);

  -- Opening e-money float for the agent (see header).
  update wallets set available = available + 3000000, version = version + 1, updated_at = now() where user_id = sab;

  for d in reverse 60..1 loop
    day := current_date - d;

    -- Sabbir_Tele → Ashraful: Cash In (agent gives e-money, takes cash, earns 0.2%).
    if d = 60 or random() < 0.3 then
      amt := pg_temp.tk(1000, 8000, 100);
      perform pg_temp.post('CASH_IN', amt, pg_temp.at_on(day), 'Cash In at agent',
        sab, 'Sabbir_Tele', sab_no, 'AGENT', ash, 'Ashraful Islam', ash_no, 'PERSONAL',
        c_uid => sab, c_amt => round(amt * 0.002)::bigint, cash_uid => sab, cash_delta => amt);
    end if;

    -- Ashraful → Nafiztong: shopping, sometimes twice a day.
    for i in 1 .. (case when random() < 0.5 then 1 else 0 end) + (case when random() < 0.15 then 1 else 0 end) loop
      amt := pg_temp.tk(150, 2500);
      at := pg_temp.at_on(day);
      t := pg_temp.post('MERCHANT_PAYMENT', amt, at, 'Payment to Nafiztong',
        ash, 'Ashraful Islam', ash_no, 'PERSONAL', naf, 'Nafiztong', naf_id, 'MERCHANT',
        p_rfee => round(amt * 0.015)::bigint,
        p_method => (case when random() < 0.7 then 'QR_SCAN' else 'MERCHANT_ID' end)::payment_method);

      -- Nafiztong → Ashraful: occasional refund of that payment.
      if t is not null and random() < 0.06 then
        refund_amt := case when random() < 0.6 then amt else (round(amt * 0.3 / 100) * 100)::bigint end;
        if pg_temp.post('REFUND', refund_amt, at + interval '2 hours',
             case when refund_amt = amt then 'Order cancelled — full refund' else 'Partial refund — item unavailable' end,
             naf, 'Nafiztong', naf_id, 'MERCHANT', ash, 'Ashraful Islam', ash_no, 'PERSONAL', p_related => t) is not null then
          update transactions
             set refunded_amount = refunded_amount + refund_amt,
                 status = case when refunded_amount + refund_amt >= amount then 'REFUNDED'::transaction_status else status end
           where trx_id = t;
        end if;
      end if;
    end loop;

    -- Ashraful → Sabbir_Tele: Cash Out (1.85% fee; agent earns 0.4%, pays out cash).
    if random() < 0.15 then
      amt := pg_temp.tk(500, 4000, 100);
      perform pg_temp.post('CASH_OUT', amt, pg_temp.at_on(day), 'Cash Out at agent',
        ash, 'Ashraful Islam', ash_no, 'PERSONAL', sab, 'Sabbir_Tele', sab_no, 'AGENT',
        p_sfee => round(amt * 0.0185)::bigint, c_uid => sab, c_amt => round(amt * 0.004)::bigint,
        cash_uid => sab, cash_delta => -amt);
    end if;
  end loop;

  raise notice 'Added % transactions.', (select count(*) from transactions where id like 'txn_smp_%');
end $$;

commit;

-- Result.
select u.name, u.role,
       w.available / 100.0 as balance_taka,
       w.cash_in_hand / 100.0 as outlet_cash_taka,
       (select count(*) from transactions t
         where t.id like 'txn_smp_%' and (t.sender_user_id = u.id or t.receiver_user_id = u.id)) as sample_transactions
from users u join wallets w on w.user_id = u.id
where u.id in ('usr_ashraful', 'usr_sabbir_tele', 'usr_nafiztong')
order by u.role;
