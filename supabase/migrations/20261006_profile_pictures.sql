-- Profile pictures. Run once in Supabase → SQL Editor on a database created
-- before this change. Safe on live data: it adds one nullable column and a
-- new table. Safe to re-run.

-- The user's current picture (null = initials are shown).
alter table users add column if not exists avatar_id text;

-- Picture bytes. Kept out of the app's per-request snapshot and served by
-- GET /api/avatars/:id to signed-in users. JPG, PNG or WebP, at most 2 MB.
-- user_id is null between an upload during registration and account creation.
create table if not exists avatars (
  id          text primary key,
  user_id     text        references users (id) on delete cascade,
  mime_type   text        not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes  int         not null check (size_bytes > 0 and size_bytes <= 2097152),
  sha256      text        not null,
  data        bytea       not null,
  created_at  timestamptz not null default now()
);
create index if not exists avatars_user_idx on avatars (user_id);
alter table avatars enable row level security;
