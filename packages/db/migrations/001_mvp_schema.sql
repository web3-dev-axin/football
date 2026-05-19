create table if not exists teams (
  id text primary key,
  name text not null,
  fifa_code text not null unique,
  confederation text not null,
  qualified_status text not null
);

create table if not exists fixtures (
  id text primary key,
  fifa_match_id text not null unique,
  match_number integer not null,
  home_team text not null,
  away_team text not null,
  status text not null,
  home_score integer not null default 0,
  away_score integer not null default 0,
  match_second integer not null default 0,
  display_clock text not null,
  venue text not null,
  kickoff_at_utc timestamptz not null,
  data_quality_status text not null default 'pending'
);

create table if not exists data_source_snapshots (
  id text primary key,
  subject_key text not null,
  source text not null,
  payload_hash text not null,
  payload jsonb not null,
  source_timestamp timestamptz not null,
  ingested_at timestamptz not null,
  unique (subject_key, source, payload_hash)
);

create table if not exists data_comparisons (
  id text primary key,
  subject_type text not null,
  subject_key text not null,
  status text not null,
  critical_mismatch_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  mismatches jsonb not null default '[]'::jsonb,
  unique (subject_type, subject_key)
);

create table if not exists live_windows (
  id text primary key,
  fixture_id text not null references fixtures(id),
  window_key text not null unique,
  window_type text not null,
  start_match_second integer not null,
  end_match_second integer not null,
  trading_close_match_second integer not null,
  title text not null,
  status text not null,
  market_id text,
  data_quality_status text not null default 'pending'
);

create table if not exists markets (
  id text primary key,
  live_window_id text not null references live_windows(id),
  market_key text not null unique,
  title text not null,
  status text not null,
  market_address text,
  tx_hash text,
  volume_raw text not null default '0',
  liquidity_raw text not null default '0',
  oracle_state text not null default 'none',
  data_quality_status text not null default 'pending'
);

create table if not exists market_outcomes (
  market_id text not null references markets(id),
  outcome_index integer not null,
  label text not null,
  probability_bps integer not null,
  token_id text,
  primary key (market_id, outcome_index)
);

create table if not exists match_events (
  id text primary key,
  fixture_id text not null references fixtures(id),
  provider_event_id text not null,
  event_type text not null,
  team text not null,
  match_minute integer not null,
  match_second integer not null,
  is_confirmed boolean not null,
  is_cancelled boolean not null,
  source text not null,
  unique (fixture_id, provider_event_id)
);

create table if not exists result_proposals (
  id text primary key,
  market_id text not null references markets(id),
  winning_outcome integer not null,
  goal_count_in_window integer not null,
  evidence_uri text not null,
  challenge_deadline timestamptz not null,
  status text not null,
  tx_hash text
);

create table if not exists trades (
  id text primary key,
  market_id text not null references markets(id),
  wallet_address text not null,
  outcome_index integer not null,
  collateral_amount_raw text not null,
  shares_amount_raw text not null,
  trade_type text not null
);

create table if not exists redemptions (
  id text primary key,
  market_id text not null references markets(id),
  wallet_address text not null,
  outcome_index integer not null,
  shares_burned_raw text not null,
  collateral_paid_raw text not null
);
