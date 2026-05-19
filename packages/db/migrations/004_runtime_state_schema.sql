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
