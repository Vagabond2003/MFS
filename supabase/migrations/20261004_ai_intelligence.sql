-- Merchant & agent intelligence (hackathon Track 05).
-- Run once in Supabase → SQL Editor. Safe on live data: it only adds nullable
-- columns and a new table; nothing existing is changed or removed.

-- Where agents and merchants operate (structured location for coverage analysis).
alter table agent_profiles      add column if not exists district text;
alter table agent_profiles      add column if not exists area     text;
alter table merchant_businesses add column if not exists district text;
alter table merchant_businesses add column if not exists area     text;

create index if not exists agent_profiles_district_idx      on agent_profiles (district);
create index if not exists merchant_businesses_district_idx on merchant_businesses (district);

-- Cache of AI-written explanations. The numbers behind them are computed by the
-- app; this only stores the wording, keyed by the exact input it explained.
create table if not exists ai_insights (
  id          text primary key,
  user_id     text        not null references users (id) on delete cascade deferrable initially deferred,
  kind        text        not null,                       -- e.g. agent.liquidity, merchant.recommendations
  language    text        not null check (language in ('en', 'bn')),
  input_hash  text        not null,                       -- SHA-256 of the computed figures that were explained
  payload     jsonb       not null,                       -- validated JSON returned by the model (or the template)
  model       text        not null,                       -- model id, or 'template' when no model answered
  created_at  timestamptz not null default now()
);
create index if not exists ai_insights_lookup_idx on ai_insights (user_id, kind, language, input_hash, created_at desc);

-- Same rule as every other table: no access through the public API keys.
alter table ai_insights enable row level security;
