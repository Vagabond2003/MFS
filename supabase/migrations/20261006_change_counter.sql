-- Speed-up: a change counter so the app can cache the database in memory.
-- Run once in Supabase → SQL Editor. Safe on live data: it only adds a
-- one-row table, one function and triggers; no data is changed or removed.
--
-- Every insert/update/delete on an app table (from the app OR from the
-- Supabase dashboard) bumps app_state.version. The app reads that single
-- number on each request and reloads its in-memory copy only when it moved,
-- instead of loading every table on every request.

create table if not exists app_state (
  id      int    primary key default 1 check (id = 1),
  version bigint not null default 0
);
insert into app_state (id, version) values (1, 0) on conflict (id) do nothing;
alter table app_state enable row level security;

create or replace function bump_app_version() returns trigger
language plpgsql as $$
begin
  update app_state set version = version + 1 where id = 1;
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'personal_profiles', 'agent_profiles', 'merchant_profiles', 'merchant_businesses',
    'account_status_history', 'verification_documents', 'wallets', 'transactions', 'commissions',
    'notifications', 'otp_codes', 'sessions', 'audit_logs', 'disputes', 'payment_requests',
    'rate_limits', 'idempotency_keys', 'ai_insights'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on %I', t || '_bump_version', t);
      execute format(
        'create trigger %I after insert or update or delete or truncate on %I for each statement execute function bump_app_version()',
        t || '_bump_version', t);
    end if;
  end loop;
end $$;
