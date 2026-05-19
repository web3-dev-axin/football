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
