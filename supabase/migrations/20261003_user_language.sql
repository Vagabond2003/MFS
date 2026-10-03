-- Interface language preference per user: English ('en') or Bengali ('bn').
-- Run once in Supabase → SQL Editor on a database created before this change.
-- Safe on live data: it only adds a column with a default.
alter table users
  add column if not exists language text not null default 'en'
  check (language in ('en', 'bn'));
