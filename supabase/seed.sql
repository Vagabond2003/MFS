-- ════════════════════════════════════════════════════════════════════
-- Kosh MFS — starting accounts. Run AFTER schema.sql.
--
--   Role      Name             Login                 Password    PIN
--   PERSONAL  Ashraful Islam   01700000001           demo@1234   24680
--   AGENT     Sabbir_Tele      01814557644           demo@1234   24680
--   MERCHANT  Nafiztong        01773519331           demo@1234   24680
--   ADMIN     Platform Admin   admin@example.com     Demo@1234   24680  (2FA on)
--
-- Passwords and PINs are stored as salted PBKDF2-SHA256 hashes (same format
-- as src/services/mock/crypto.ts). Change them in the app after first login.
-- Wallets start empty. The agent starts with ৳50,000 of physical cash
-- recorded at the outlet (cash_in_hand), so Cash Out / float top-up work.
-- Profile fields marked "Not provided" are placeholders — edit them here or
-- in the Supabase table editor; the app picks changes up on the next request.
-- ════════════════════════════════════════════════════════════════════

begin;

insert into users
  (id, role, name, phone, email, password_hash, pin_hash, status, two_factor_enabled, is_demo, created_at, updated_at)
values
  ('usr_demo_admin', 'ADMIN', 'Platform Admin', '01300000000', 'admin@example.com',
   'pbkdf2_sha256$60000$BzmVSYVu3lX8zZuCE6PuMQ==$m6gEPOh/q0kmKujB4OJOxy5dCP4Xk5X5RLXhjS0+Dkc=',
   'pbkdf2_sha256$60000$St5KmeDXDu/3YWoTMl2QRg==$D+ANyIrfH+HYcHxdq5lWXcWjwlxKYUYOEy/RRJRk1Ls=',
   'ACTIVE', true, true, now() - interval '500 days', now() - interval '500 days'),
  ('usr_ashraful', 'PERSONAL', 'Ashraful Islam', '01700000001', null,
   'pbkdf2_sha256$60000$iMw//H+lNAadzlFcud7B1g==$FpVghehLRROJEBtlct5Z1plO3VWKc2Pwns87Q8Pd4/M=',
   'pbkdf2_sha256$60000$C0M1D0VJl8h0Kz6N4rsT9g==$Hz5IHuXi2Af/Mb1yJh5zKTTr5PVQKBnrG19L/gW6gx8=',
   'VERIFIED', false, false, now(), now()),
  ('usr_sabbir_tele', 'AGENT', 'Sabbir_Tele', '01814557644', null,
   'pbkdf2_sha256$60000$ciUUZsfZsHgeT/8u7LA7iA==$/jZ+XfLzmcghBWYNS7OkNGRi+VTdSlrOfQS8BC9wvq4=',
   'pbkdf2_sha256$60000$vdP6ieet8Pvcn09Bj/bT9g==$/Zm6NAyiDAjQ+0wMKrHoY19w6nGqe4uLfq6oX0UlHpc=',
   'VERIFIED', false, false, now(), now()),
  ('usr_nafiztong', 'MERCHANT', 'Nafiztong', '01773519331', null,
   'pbkdf2_sha256$60000$LQvBjh34qg/Q+rQL9FLsMA==$Hu/HfpBr/to0CrZQy+U8oTPVhIRcaq7dYKjRQ0uw7Dc=',
   'pbkdf2_sha256$60000$LDgRDAoqsgbWHI0J//aDGA==$myCPiiXAQMVMx6OaS2uCDPiWGEZ62KsaK+Gr3XALteU=',
   'VERIFIED', false, false, now(), now());

insert into personal_profiles (user_id, date_of_birth, address, nid_number, selfie_status) values
  ('usr_ashraful', '2000-01-01', 'Dhaka, Bangladesh', null, 'VERIFIED');

insert into agent_profiles
  (user_id, agent_code, date_of_birth, address, outlet_name, business_address,
   emergency_name, emergency_relation, emergency_phone, nid_number, review_note)
values
  ('usr_sabbir_tele', 'AG-10001', '1995-01-01', 'Dhaka, Bangladesh', 'Sabbir_Tele', 'Dhaka, Bangladesh',
   'Not provided', 'Other', '01814557644', '1000000001', 'Created by administrator');

insert into merchant_profiles (user_id, owner_name, owner_nid_number, review_note) values
  ('usr_nafiztong', 'Nafiztong', '1000000002', 'Created by administrator');

insert into merchant_businesses
  (id, user_id, merchant_id, business_name, category, business_address,
   registration_number, trade_license_number, tax_id, settlement_account)
values
  ('biz_nafiztong', 'usr_nafiztong', 'MR-40001', 'Nafiztong', 'OTHER', 'Dhaka, Bangladesh',
   'Not provided', 'Not provided', null, 'Not set');

-- Amounts are in paisa: 5000000 = ৳50,000.
insert into wallets (id, user_id, currency, available, savings, pending, cash_in_hand, version, updated_at) values
  ('wal_ashraful',    'usr_ashraful',    'BDT', 0, 0, 0, null,    0, now()),
  ('wal_sabbir_tele', 'usr_sabbir_tele', 'BDT', 0, 0, 0, 5000000, 0, now()),
  ('wal_nafiztong',   'usr_nafiztong',   'BDT', 0, 0, 0, null,    0, now());

insert into account_status_history (id, user_id, status, note, actor_id, at) values
  ('sth_ashraful',    'usr_ashraful',    'VERIFIED', 'Account created by administrator', 'usr_demo_admin', now()),
  ('sth_sabbir_tele', 'usr_sabbir_tele', 'VERIFIED', 'Account created by administrator', 'usr_demo_admin', now()),
  ('sth_nafiztong',   'usr_nafiztong',   'VERIFIED', 'Account created by administrator', 'usr_demo_admin', now());

commit;
