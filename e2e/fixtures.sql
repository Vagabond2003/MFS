-- Extra rows for the end-to-end tests, loaded after supabase/schema.sql and
-- supabase/seed.sql into a throwaway database (see e2e/global-setup.ts).
-- Never run this against a real database.

begin;

-- A second personal wallet to send money to (same demo password and PIN as Ashraful).
insert into users
  (id, role, name, phone, email, password_hash, pin_hash, status, two_factor_enabled, is_demo, created_at, updated_at)
select 'usr_e2e_recipient', 'PERSONAL', 'Rahima Begum', '01700000002', null, password_hash, pin_hash, 'VERIFIED', false, true, now(), now()
from users where id = 'usr_ashraful';

insert into personal_profiles (user_id, date_of_birth, address, nid_number, selfie_status) values
  ('usr_e2e_recipient', '1998-05-05', 'Dhaka, Bangladesh', null, 'VERIFIED');

insert into wallets (id, user_id, currency, available, savings, pending, cash_in_hand, version, updated_at) values
  ('wal_e2e_recipient', 'usr_e2e_recipient', 'BDT', 0, 0, 0, null, 0, now());

-- Ashraful starts with ৳5,000 (500000 paisa), recorded as an Add Money so the history matches the balance.
insert into transactions
  (id, trx_id, type, status, amount, sender_fee, receiver_fee,
   sender_user_id, sender_name, sender_account, sender_kind,
   receiver_user_id, receiver_name, receiver_account, receiver_kind,
   description, refunded_amount, created_at, completed_at)
values
  ('txn_e2e_opening', 'E2EOPEN001', 'ADD_MONEY', 'SUCCESSFUL', 500000, 0, 0,
   null, 'Demo Bank — Savings', '•••• 4521', 'BANK',
   'usr_ashraful', 'Ashraful Islam', '01700000001', 'PERSONAL',
   'Add Money from Demo Bank — Savings', 0, now() - interval '1 hour', now() - interval '1 hour');

update wallets set available = 500000, version = version + 1 where user_id = 'usr_ashraful';

commit;
