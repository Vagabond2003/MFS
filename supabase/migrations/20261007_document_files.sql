-- Verification document files (NID, photo, trade license …). Run once in
-- Supabase → SQL Editor on a database created before this change. Safe on
-- live data: it only adds a new table. Safe to re-run.
--
-- Until now uploads kept only metadata and a SHA-256 hash. The bytes now live
-- here, outside the app's in-memory snapshot, and GET /api/documents/:id
-- serves them to administrators (every view is audit-logged). Documents
-- uploaded before this change have no row here; the viewer says so.

create table if not exists document_files (
  document_id text        primary key references verification_documents (id) on delete cascade deferrable initially deferred,
  mime_type   text        not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes  int         not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256      text        not null,
  data        bytea       not null,
  created_at  timestamptz not null default now()
);
alter table document_files enable row level security;
