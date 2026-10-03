-- Optional one-time cleanup. Before this fix the app saved jsonb values as a
-- JSON *string* holding the JSON ("{\"device\":…}") instead of the object.
-- The app reads both forms correctly; this turns the old rows into objects so
-- they also look right in SQL queries. Safe to re-run.

update audit_logs  set metadata = (metadata #>> '{}')::jsonb where jsonb_typeof(metadata) = 'string';

do $$
begin
  if to_regclass('public.ai_insights') is not null then
    update ai_insights set payload = (payload #>> '{}')::jsonb where jsonb_typeof(payload) = 'string';
  end if;
end $$;
