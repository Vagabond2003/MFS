-- Admin reviews of intelligence flags (agent patterns and merchant churn risk).
-- Run once in Supabase → SQL Editor on a database created before this change.
-- Safe on live data: it only adds a new table (and its change-counter trigger).
-- Safe to re-run.
--
-- Each row is one decision by an administrator on the Intelligence page:
-- CONFIRMED (the flag was right) or DISMISSED (it wasn't). Decisions are kept,
-- never overwritten — the latest one per flag is shown — and every decision is
-- also written to audit_logs. Until this runs, the page shows the flags but
-- refuses to save a decision.

create table if not exists flag_reviews (
  id              text        primary key,
  kind            text        not null check (kind in ('AGENT_FLAG', 'CHURN')),
  subject_user_id text        not null references users (id) on delete cascade deferrable initially deferred,
  code            text        not null,              -- agent flag code, or 'CHURN'
  decision        text        not null check (decision in ('CONFIRMED', 'DISMISSED')),
  note            text        check (note is null or char_length(note) <= 300),
  flag_value      double precision,                  -- the flag's measure (or churn score) when it was reviewed
  severity        text,                              -- HIGH / MEDIUM when it was reviewed
  reviewer_id     text        references users (id) on delete set null deferrable initially deferred,
  created_at      timestamptz not null default now()
);
create index if not exists flag_reviews_subject_idx on flag_reviews (subject_user_id, code, created_at desc);
alter table flag_reviews enable row level security;

do $$
begin
  if to_regprocedure('bump_app_version()') is not null then
    drop trigger if exists flag_reviews_bump_version on flag_reviews;
    create trigger flag_reviews_bump_version after insert or update or delete or truncate on flag_reviews
      for each statement execute function bump_app_version();
  end if;
end $$;
