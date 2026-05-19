create table if not exists tournaments (
  id text primary key,
  name text not null,
  year integer not null,
  host_country text not null
);

create table if not exists groups (
  id text primary key,
  tournament_id text not null,
  name text not null
);

create table if not exists venues (
  id text primary key,
  name text not null,
  city text not null,
  country text not null,
  timezone text not null
);

create table if not exists team_rankings (
  team_id text primary key,
  fifa_rank integer not null,
  points numeric not null,
  updated_at timestamptz not null default now()
);

create table if not exists odds_snapshots (
  id text primary key,
  market_id text not null,
  provider text not null,
  outcome_probabilities_bps jsonb not null,
  source_timestamp timestamptz not null,
  ingested_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists odds_comparisons (
  id text primary key,
  market_id text not null,
  status text not null,
  max_deviation_bps integer not null,
  mismatches jsonb not null default '[]'::jsonb,
  compared_at timestamptz not null
);

create index if not exists odds_snapshots_market_id_idx on odds_snapshots (market_id);
create index if not exists odds_comparisons_market_id_idx on odds_comparisons (market_id);
