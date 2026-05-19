-- Core MVP schema
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

-- Tournament schedule and odds schema
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

-- Commercial operations schema
create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null,
  environment text not null default 'local',
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table if not exists risk_limits (
  id text primary key,
  scope text not null,
  subject_id text not null,
  max_order_amount_raw text not null,
  max_user_exposure_raw text not null,
  max_market_volume_raw text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (scope, subject_id)
);

create table if not exists operator_actions (
  id text primary key,
  operator_id text not null,
  action_type text not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists market_pauses (
  id text primary key,
  market_id text not null,
  status text not null,
  reason text not null,
  paused_by text not null,
  paused_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists liquidity_snapshots (
  id text primary key,
  market_id text not null,
  liquidity_raw text not null,
  volume_raw text not null,
  inventory_risk_bps integer not null,
  captured_at timestamptz not null default now()
);

create table if not exists provider_health_checks (
  id text primary key,
  provider text not null,
  status text not null,
  latency_ms integer not null,
  last_update_age_seconds integer not null,
  checked_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create table if not exists challenges (
  id text primary key,
  result_proposal_id text not null,
  challenger_address text not null,
  reason text not null,
  evidence_uri text not null,
  bond_amount_raw text not null default '0',
  challenge_tx_hash text,
  status text not null default 'open',
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_positions (
  id text primary key,
  wallet_address text not null,
  market_id text not null,
  outcome_index integer not null,
  token_id text,
  shares_raw text not null,
  avg_entry_price_bps integer not null,
  realized_pnl_raw text not null default '0',
  unrealized_pnl_raw text not null default '0',
  last_indexed_block bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (wallet_address, market_id, outcome_index)
);

create table if not exists indexed_blocks (
  chain_id integer not null,
  block_number bigint not null,
  block_hash text not null,
  indexed_at timestamptz not null default now(),
  primary key (chain_id, block_number),
  unique (chain_id, block_number)
);

alter table live_windows add column if not exists commercial_market_type text;
alter table live_windows add column if not exists resolution_policy text;
alter table markets add column if not exists chain_creation_enabled boolean not null default true;
alter table markets add column if not exists risk_level text not null default 'medium';
alter table markets add column if not exists paused boolean not null default false;

-- Runtime state schema
create table if not exists commercial_market_definitions (
  id text primary key,
  fixture_id text not null references fixtures(id),
  market_type text not null,
  window_key text not null unique,
  title text not null,
  start_match_second integer not null,
  end_match_second integer not null,
  trading_close_match_second integer not null,
  outcomes jsonb not null default '[]'::jsonb,
  resolution_policy text not null,
  risk_level text not null,
  chain_creation_enabled boolean not null default true
);

create table if not exists refund_requests (
  id text primary key,
  market_id text not null,
  wallet_address text not null,
  status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
