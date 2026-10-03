-- ════════════════════════════════════════════════════════════════════
-- Kosh MFS — PostgreSQL / Supabase schema
--
-- Mirrors src/services/mock/schema.ts. The app (NEXT_PUBLIC_API_MODE=supabase)
-- reads and writes these tables through src/server/db-store.ts.
--
-- Run order in Supabase → SQL Editor:  1) this file   2) seed.sql
-- WARNING: re-running this file DROPS all tables and their data.
--
-- Conventions
--   • Money is stored as BIGINT in paisa (1 BDT = 100), same as the app.
--   • Secrets are stored hashed only (password, PIN, OTP) — never plaintext.
--   • IDs are text (e.g. usr_k3j9…, MR-40001) because the app generates them.
--   • Foreign keys are DEFERRABLE INITIALLY DEFERRED: checked at COMMIT, so
--     one app transaction can insert related rows in any order.
--   • Row Level Security is ON for every table with NO policies, so the
--     public anon/authenticated API keys can read and write nothing.
--     The app connects with the database password (DATABASE_URL), which
--     bypasses RLS. Never expose DATABASE_URL to the browser.
-- ════════════════════════════════════════════════════════════════════

begin;

drop table if exists
  app_state, avatars, document_files, ai_insights, idempotency_keys, rate_limits, payment_requests, disputes, audit_logs,
  sessions, otp_codes, notifications, commissions, transactions, wallets,
  verification_documents, account_status_history, merchant_businesses,
  merchant_profiles, agent_profiles, personal_profiles, users
  cascade;

drop type if exists
  user_role, account_status, selfie_status, document_type, document_status,
  business_category, party_kind, transaction_type, transaction_status,
  payment_method, settlement_direction, notification_type, otp_purpose,
  dispute_status, payment_request_status
  cascade;

-- ───────────────────────── Enums ─────────────────────────

create type user_role as enum ('PERSONAL', 'AGENT', 'MERCHANT', 'ADMIN');

create type account_status as enum (
  'PENDING_VERIFICATION', 'APPLICATION_SUBMITTED', 'PENDING', 'UNDER_REVIEW',
  'VERIFIED', 'REJECTED', 'SUSPENDED', 'ACTIVE'
);

create type selfie_status as enum ('NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'FAILED');

create type document_type as enum (
  'NID_FRONT', 'NID_BACK', 'PHOTO', 'SELFIE', 'TRADE_LICENSE',
  'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'OWNER_NID', 'OTHER'
);
create type document_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create type business_category as enum (
  'RESTAURANT', 'GROCERY', 'RETAIL', 'ECOMMERCE', 'PHARMACY', 'SERVICES', 'OTHER'
);

-- EXTERNAL covers outside mobile wallets (bKash, Nagad, Rocket, Upay) used by Add Money.
create type party_kind as enum (
  'PERSONAL', 'AGENT', 'MERCHANT', 'BILLER', 'OPERATOR', 'BANK', 'SYSTEM', 'EXTERNAL'
);

create type transaction_type as enum (
  'SEND_MONEY', 'CASH_IN', 'CASH_OUT', 'MOBILE_RECHARGE', 'MERCHANT_PAYMENT',
  'BILL_PAYMENT', 'ADD_MONEY', 'REFUND', 'COMMISSION', 'SETTLEMENT'
);
create type transaction_status as enum ('PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED');
create type payment_method as enum ('QR_SCAN', 'MERCHANT_ID', 'PAYMENT_LINK', 'ONLINE_CHECKOUT');
create type settlement_direction as enum ('TO_BANK', 'FLOAT_TOP_UP');

create type notification_type as enum (
  'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'MONEY_RECEIVED', 'MONEY_SENT',
  'ACCOUNT_VERIFICATION', 'SECURITY_ALERT', 'MERCHANT_PAYMENT',
  'AGENT_SETTLEMENT', 'SYSTEM_ANNOUNCEMENT'
);

create type otp_purpose as enum (
  'REGISTRATION', 'LOGIN', 'PASSWORD_RESET', 'TRANSACTION',
  'CUSTOMER_CASH_OUT', 'CHANGE_PIN', 'ENABLE_2FA'
);

create type dispute_status as enum ('OPEN', 'INVESTIGATING', 'RESOLVED', 'REJECTED');
create type payment_request_status as enum ('AWAITING', 'PAID', 'EXPIRED', 'CANCELLED');

-- ───────────────────────── Users & profiles ─────────────────────────

create table users (
  id                 text primary key,
  role               user_role       not null,
  name               text            not null,
  phone              text            not null unique check (phone ~ '^01[3-9][0-9]{8}$'),
  email              text            unique,
  password_hash      text            not null,   -- PBKDF2-SHA256
  pin_hash           text            not null,   -- PBKDF2-SHA256, 5-digit PIN
  status             account_status  not null,
  two_factor_enabled boolean         not null default false,
  language           text            not null default 'en' check (language in ('en', 'bn')),  -- interface language
  avatar_id          text,                                                                 -- current profile picture (avatars.id)
  is_demo            boolean         not null default false,
  failed_login_count int             not null default 0,
  locked_until       timestamptz,
  pin_failed_count   int             not null default 0,
  pin_locked_until   timestamptz,
  created_at         timestamptz     not null default now(),
  updated_at         timestamptz     not null default now(),
  last_login_at      timestamptz
);
create index users_role_status_idx on users (role, status);

create table personal_profiles (
  user_id        text primary key references users (id) on delete cascade deferrable initially deferred,
  date_of_birth  date          not null,
  address        text          not null,
  nid_number     text,                           -- encrypt at rest (e.g. pgsodium / Vault)
  selfie_status  selfie_status not null default 'NOT_SUBMITTED'
);

create table agent_profiles (
  user_id            text primary key references users (id) on delete cascade deferrable initially deferred,
  agent_code         text not null unique,
  date_of_birth      date not null,
  address            text not null,
  outlet_name        text not null,
  business_address   text not null,
  emergency_name     text not null,
  emergency_relation text not null,
  emergency_phone    text not null,
  nid_number         text not null,              -- encrypt at rest
  review_note        text,
  district           text,                       -- where the outlet operates (coverage analysis)
  area               text
);
create index agent_profiles_district_idx on agent_profiles (district);

create table merchant_profiles (
  user_id         text primary key references users (id) on delete cascade deferrable initially deferred,
  owner_name      text not null,
  owner_nid_number text not null,                -- encrypt at rest
  review_note     text
);

create table merchant_businesses (
  id                   text primary key,
  user_id              text              not null unique references users (id) on delete cascade deferrable initially deferred,
  merchant_id          text              not null unique,   -- public id, e.g. MR-40021
  business_name        text              not null,
  category             business_category not null,
  business_address     text              not null,
  registration_number  text              not null,
  trade_license_number text              not null,
  tax_id               text,
  settlement_account   text              not null,
  district             text,                                 -- where the business operates
  area                 text
);
create index merchant_businesses_district_idx on merchant_businesses (district);

create table account_status_history (
  id        text primary key,
  user_id   text           not null references users (id) on delete cascade deferrable initially deferred,
  status    account_status not null,
  note      text,
  actor_id  text references users (id) on delete set null deferrable initially deferred,
  at        timestamptz    not null default now()
);
create index account_status_history_user_idx on account_status_history (user_id, at desc);

create table verification_documents (
  id           text primary key,
  user_id      text references users (id) on delete cascade deferrable initially deferred,   -- null while uploaded but not yet registered
  type         document_type   not null,
  file_name    text            not null,
  mime_type    text            not null,
  size_bytes   int             not null check (size_bytes > 0),
  sha256       text            not null,
  storage_key  text            not null,                       -- Supabase Storage object path
  status       document_status not null default 'PENDING',
  uploaded_at  timestamptz     not null default now(),
  reviewed_at  timestamptz,
  review_note  text,
  reviewed_by  text references users (id) on delete set null deferrable initially deferred
);
create index verification_documents_user_idx on verification_documents (user_id);

-- ───────────────────────── Wallets & ledger ─────────────────────────

create table wallets (
  id            text primary key,
  user_id       text not null unique references users (id) on delete cascade deferrable initially deferred,
  currency      text not null default 'BDT' check (currency = 'BDT'),
  available     bigint not null default 0 check (available >= 0),
  savings       bigint not null default 0 check (savings   >= 0),
  pending       bigint not null default 0 check (pending   >= 0),
  cash_in_hand  bigint check (cash_in_hand is null or cash_in_hand >= 0),  -- agents only
  version       int    not null default 0,           -- optimistic locking: bump on every balance change
  updated_at    timestamptz not null default now()
);

create table transactions (
  id            text primary key,
  trx_id        text                not null unique,  -- public id shown to users, e.g. WNX5QSFCTB
  type          transaction_type    not null,
  status        transaction_status  not null,
  amount        bigint              not null check (amount > 0),
  sender_fee    bigint              not null default 0 check (sender_fee   >= 0),
  receiver_fee  bigint              not null default 0 check (receiver_fee >= 0),

  -- sender / receiver party snapshot (user_id is null for banks, billers, outside wallets…)
  sender_user_id    text references users (id) on delete set null deferrable initially deferred,
  sender_name       text       not null,
  sender_account    text       not null,
  sender_kind       party_kind not null,
  receiver_user_id  text references users (id) on delete set null deferrable initially deferred,
  receiver_name     text       not null,
  receiver_account  text       not null,
  receiver_kind     party_kind not null,

  description     text not null,
  reference       text,                                -- payment-gateway or merchant reference
  payment_method  payment_method,
  related_trx_id  text references transactions (trx_id) on delete set null deferrable initially deferred,  -- refund → original
  refunded_amount bigint not null default 0 check (refunded_amount >= 0),

  -- commission earned by an agent on this transaction
  commission_user_id text references users (id) on delete set null deferrable initially deferred,
  commission_amount  bigint check (commission_amount is null or commission_amount >= 0),

  -- funds held / credited while PENDING (e.g. settlement to bank)
  pending_hold_user_id    text references users (id) on delete set null deferrable initially deferred,
  pending_hold_amount     bigint check (pending_hold_amount is null or pending_hold_amount >= 0),
  pending_credit_user_id  text references users (id) on delete set null deferrable initially deferred,
  pending_credit_amount   bigint check (pending_credit_amount is null or pending_credit_amount >= 0),

  -- agent outlet physical-cash movement booked with this transaction
  cash_effect_user_id  text references users (id) on delete set null deferrable initially deferred,
  cash_effect_delta    bigint,

  settle_at             timestamptz,
  failure_reason        text,
  settlement_direction  settlement_direction,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz,

  check (refunded_amount <= amount)
);
create index transactions_sender_idx   on transactions (sender_user_id,   created_at desc);
create index transactions_receiver_idx on transactions (receiver_user_id, created_at desc);
create index transactions_status_idx   on transactions (status, created_at desc);
create index transactions_settle_idx   on transactions (settle_at) where status = 'PENDING';
create index transactions_created_idx  on transactions (created_at desc);

create table commissions (
  id           text primary key,
  agent_id     text             not null references users (id) on delete cascade deferrable initially deferred,
  trx_id       text             not null references transactions (trx_id) on delete cascade deferrable initially deferred,
  type         transaction_type not null,
  base_amount  bigint           not null check (base_amount >= 0),
  amount       bigint           not null check (amount >= 0),
  created_at   timestamptz      not null default now()
);
create index commissions_agent_idx on commissions (agent_id, created_at desc);

-- ───────────────────────── Notifications, OTP, sessions ─────────────────────────

create table notifications (
  id          text primary key,
  user_id     text              not null references users (id) on delete cascade deferrable initially deferred,
  type        notification_type not null,
  title       text              not null,
  body        text              not null,
  read        boolean           not null default false,
  link        text,
  created_at  timestamptz       not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where not read;

create table otp_codes (
  id                   text primary key,
  purpose              otp_purpose not null,
  user_id              text references users (id) on delete cascade deferrable initially deferred,
  destination          text        not null,          -- phone, email, or an Add Money wallet number
  code_hash            text        not null,          -- SHA-256(id:code) — the code itself is never stored
  context              text        not null default '',  -- binds the code to the exact operation it authorises
  attempts             int         not null default 0,
  max_attempts         int         not null default 5,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  resend_available_at  timestamptz not null,
  verified_at          timestamptz,
  consumed_at          timestamptz
);
create index otp_codes_lookup_idx on otp_codes (destination, purpose) where consumed_at is null;
create index otp_codes_expiry_idx on otp_codes (expires_at);

create table sessions (
  id              text primary key,
  user_id         text        not null references users (id) on delete cascade deferrable initially deferred,
  device          text        not null,
  location        text        not null,
  ip              text        not null,
  remember        boolean     not null default false,
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz
);
create index sessions_user_idx on sessions (user_id) where revoked_at is null;

-- ───────────────────────── Audit, disputes, QR requests ─────────────────────────

-- Append-only: updates and deletes are blocked below.
create table audit_logs (
  id          text primary key,
  actor_id    text,                                  -- no FK: audit history outlives users
  actor_role  text        not null check (actor_role in ('PERSONAL','AGENT','MERCHANT','ADMIN','SYSTEM','ANONYMOUS')),
  actor_name  text        not null,
  action      text        not null,
  target      text,
  ip          text        not null,
  created_at  timestamptz not null default now(),
  metadata    jsonb       not null default '{}'::jsonb
);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_actor_idx   on audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx  on audit_logs (action);

create or replace function audit_logs_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function audit_logs_append_only();

create table disputes (
  id          text primary key,
  trx_id      text           not null references transactions (trx_id) on delete cascade deferrable initially deferred,
  user_id     text           not null references users (id) on delete cascade deferrable initially deferred,
  reason      text           not null,
  status      dispute_status not null default 'OPEN',
  resolution  text,
  amount      bigint         not null check (amount > 0),
  created_at  timestamptz    not null default now(),
  updated_at  timestamptz    not null default now()
);
create index disputes_status_idx on disputes (status, created_at desc);
create index disputes_user_idx   on disputes (user_id);

-- Dynamic merchant QR / payment requests.
create table payment_requests (
  id                text primary key,
  merchant_user_id  text                   not null references users (id) on delete cascade deferrable initially deferred,
  amount            bigint                 not null check (amount > 0),
  note              text,
  status            payment_request_status not null default 'AWAITING',
  created_at        timestamptz            not null default now(),
  expires_at        timestamptz            not null,
  paid_at           timestamptz,
  trx_id            text references transactions (trx_id) on delete set null deferrable initially deferred,
  payer_user_id     text references users (id) on delete set null deferrable initially deferred,
  payer_name        text,
  payer_account     text,
  payer_kind        party_kind
);
create index payment_requests_merchant_idx on payment_requests (merchant_user_id, created_at desc);
create index payment_requests_open_idx on payment_requests (expires_at) where status = 'AWAITING';

-- ───────────────────────── Infrastructure tables ─────────────────────────

-- Fixed-window rate limiter (key → counter).
create table rate_limits (
  key        text primary key,
  count      int         not null default 0,
  reset_at   bigint      not null            -- epoch milliseconds
);

-- Stops a double-click or retry from posting the same payment twice.
create table idempotency_keys (
  key         text primary key,
  trx_id      text        not null references transactions (trx_id) on delete cascade deferrable initially deferred,
  user_id     text        not null references users (id) on delete cascade deferrable initially deferred,
  created_at  timestamptz not null default now()
);

-- Cache of AI-written explanations. The numbers are computed by the app; this
-- stores only the wording, keyed by a hash of the exact figures explained.
create table ai_insights (
  id          text primary key,
  user_id     text        not null references users (id) on delete cascade deferrable initially deferred,
  kind        text        not null,
  language    text        not null check (language in ('en', 'bn')),
  input_hash  text        not null,
  payload     jsonb       not null,
  model       text        not null,        -- model id, or 'template'
  created_at  timestamptz not null default now()
);
create index ai_insights_lookup_idx on ai_insights (user_id, kind, language, input_hash, created_at desc);

-- Profile picture bytes (JPG/PNG/WebP, ≤ 2 MB), served by GET /api/avatars/:id.
-- Not loaded into the app's per-request snapshot. user_id is null between an
-- upload during registration and account creation.
create table avatars (
  id          text primary key,
  user_id     text        references users (id) on delete cascade,
  mime_type   text        not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes  int         not null check (size_bytes > 0 and size_bytes <= 2097152),
  sha256      text        not null,
  data        bytea       not null,
  created_at  timestamptz not null default now()
);
create index avatars_user_idx on avatars (user_id);

-- Verification document files (JPG/PNG/PDF, ≤ 5 MB), served to administrators
-- by GET /api/documents/:id. Not loaded into the app's per-request snapshot.
create table document_files (
  document_id text        primary key references verification_documents (id) on delete cascade deferrable initially deferred,
  mime_type   text        not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes  int         not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256      text        not null,
  data        bytea       not null,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── Row Level Security ─────────────────────────
-- Enabled with no policies = deny everything to anon/authenticated.
-- The backend (service_role key) bypasses RLS.

alter table users                  enable row level security;
alter table personal_profiles      enable row level security;
alter table agent_profiles         enable row level security;
alter table merchant_profiles      enable row level security;
alter table merchant_businesses    enable row level security;
alter table account_status_history enable row level security;
alter table verification_documents enable row level security;
alter table wallets                enable row level security;
alter table transactions           enable row level security;
alter table commissions            enable row level security;
alter table notifications          enable row level security;
alter table otp_codes              enable row level security;
alter table sessions               enable row level security;
alter table audit_logs             enable row level security;
alter table disputes               enable row level security;
alter table payment_requests       enable row level security;
alter table rate_limits            enable row level security;
alter table idempotency_keys       enable row level security;
alter table ai_insights            enable row level security;
alter table avatars                enable row level security;
alter table document_files         enable row level security;

-- ───────────────────────── Change counter (lets the app cache the database) ─────────────────────────
-- Same as supabase/migrations/20261006_change_counter.sql.

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

commit;
