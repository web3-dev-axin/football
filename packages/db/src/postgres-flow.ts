import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import {
  DEMO_FIXTURE_ID,
  DEMO_LIVE_WINDOW,
  type AuditLog,
  type Challenge,
  type CommercialFeatureFlags,
  type CommercialMarketDefinition,
  type DataComparison,
  type DataSourceSnapshot,
  type Fixture,
  type IndexedBlock,
  type LiquiditySnapshot,
  type LiveWindow,
  type Market,
  type MarketOutcome,
  type MarketPause,
  type MatchEvent,
  type OperatorAction,
  type ProviderHealthCheck,
  type Redemption,
  type RefundRequest,
  type ResultProposal,
  type RiskLimit,
  type Team,
  type Trade,
} from "@polygoal/shared";
import type { OddsComparison, OddsSnapshot } from "@polygoal/odds-ingestion";
import { createDemoState, InMemoryDb, type DbState } from "./client";

type Sql = ReturnType<typeof postgres>;
type TransactionSql = postgres.TransactionSql;
type QuerySql = Sql | TransactionSql;

export type PostgresRealFlowReport = {
  ok: boolean;
  databaseMode: "postgres";
  databaseName: string;
  reset: boolean;
  counts: {
    teams: number;
    fixtures: number;
    dataSourceSnapshots: number;
    dataComparisons: number;
    liveWindows: number;
    markets: number;
    marketOutcomes: number;
    matchEvents: number;
    oddsSnapshots: number;
    oddsComparisons: number;
    resultProposals: number;
  };
  market: Pick<Market, "id" | "status" | "oracleState" | "marketAddress">;
  proposal: Pick<ResultProposal, "id" | "status" | "winningOutcome" | "goalCountInWindow" | "evidenceUri">;
};

const TRUNCATE_TABLES = [
  "redemptions",
  "trades",
  "refund_requests",
  "commercial_market_definitions",
  "result_proposals",
  "match_events",
  "market_outcomes",
  "markets",
  "live_windows",
  "odds_comparisons",
  "odds_snapshots",
  "data_comparisons",
  "data_source_snapshots",
  "fixtures",
  "teams",
  "provider_health_checks",
  "market_pauses",
  "operator_actions",
  "audit_logs",
  "risk_limits",
  "feature_flags",
  "liquidity_snapshots",
  "challenges",
  "user_positions",
  "indexed_blocks",
  "team_rankings",
  "venues",
  "groups",
  "tournaments",
];

export function databaseName(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return parsed.pathname.replace(/^\//, "");
}

export function assertResetIsSafe(databaseUrl: string): void {
  const name = databaseName(databaseUrl);
  const isExplicitTestDatabase = name === "test" || name.endsWith("_test");
  if (!isExplicitTestDatabase && process.env.ALLOW_NON_TEST_DATABASE_RESET !== "true") {
    throw new Error(`Refusing to reset non-test database "${name}". Use a *_test database or set ALLOW_NON_TEST_DATABASE_RESET=true.`);
  }
}

function toJson(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}

export async function applyPostgresMigrations(sql: QuerySql): Promise<string[]> {
  const migrationDir = join(new URL(".", import.meta.url).pathname, "..", "migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await sql.unsafe(await readFile(join(migrationDir, file), "utf8"));
  }
  return files;
}

export async function resetPostgres(sql: QuerySql): Promise<void> {
  await sql.unsafe(`truncate table ${TRUNCATE_TABLES.join(", ")} restart identity cascade`);
}

async function insertTeam(sql: QuerySql, team: Team): Promise<void> {
  await sql`
    insert into teams (id, name, fifa_code, confederation, qualified_status)
    values (${team.id}, ${team.name}, ${team.fifaCode}, ${team.confederation}, ${team.qualifiedStatus})
    on conflict (id) do update set
      name = excluded.name,
      fifa_code = excluded.fifa_code,
      confederation = excluded.confederation,
      qualified_status = excluded.qualified_status
  `;
}

async function insertFixture(sql: QuerySql, fixture: Fixture): Promise<void> {
  await sql`
    insert into fixtures (
      id, fifa_match_id, match_number, home_team, away_team, status, home_score, away_score,
      match_second, display_clock, venue, kickoff_at_utc, data_quality_status
    )
    values (
      ${fixture.id}, ${fixture.fifaMatchId}, ${fixture.matchNumber}, ${fixture.homeTeam}, ${fixture.awayTeam},
      ${fixture.status}, ${fixture.homeScore}, ${fixture.awayScore}, ${fixture.matchSecond}, ${fixture.displayClock},
      ${fixture.venue}, ${fixture.kickoffAtUtc}, ${fixture.dataQualityStatus}
    )
    on conflict (id) do update set
      fifa_match_id = excluded.fifa_match_id,
      match_number = excluded.match_number,
      home_team = excluded.home_team,
      away_team = excluded.away_team,
      status = excluded.status,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      match_second = excluded.match_second,
      display_clock = excluded.display_clock,
      venue = excluded.venue,
      kickoff_at_utc = excluded.kickoff_at_utc,
      data_quality_status = excluded.data_quality_status
  `;
}

async function insertSnapshot(sql: QuerySql, snapshot: DataSourceSnapshot): Promise<void> {
  await sql`
    insert into data_source_snapshots (id, subject_key, source, payload_hash, payload, source_timestamp, ingested_at)
    values (
      ${snapshot.id}, ${snapshot.subjectKey}, ${snapshot.source}, ${snapshot.payloadHash},
      ${sql.json(toJson(snapshot.payload))}, ${snapshot.sourceTimestamp}, ${snapshot.ingestedAt}
    )
    on conflict (id) do update set
      subject_key = excluded.subject_key,
      source = excluded.source,
      payload_hash = excluded.payload_hash,
      payload = excluded.payload,
      source_timestamp = excluded.source_timestamp,
      ingested_at = excluded.ingested_at
  `;
}

async function insertComparison(sql: QuerySql, comparison: DataComparison): Promise<void> {
  await sql`
    insert into data_comparisons (id, subject_type, subject_key, status, critical_mismatch_count, warnings, mismatches)
    values (
      ${comparison.id}, ${comparison.subjectType}, ${comparison.subjectKey}, ${comparison.status},
      ${comparison.criticalMismatchCount}, ${sql.json(toJson(comparison.warnings))}, ${sql.json(toJson(comparison.mismatches))}
    )
    on conflict (id) do update set
      subject_type = excluded.subject_type,
      subject_key = excluded.subject_key,
      status = excluded.status,
      critical_mismatch_count = excluded.critical_mismatch_count,
      warnings = excluded.warnings,
      mismatches = excluded.mismatches
  `;
}

async function insertLiveWindow(sql: QuerySql, liveWindow: LiveWindow): Promise<void> {
  await sql`
    insert into live_windows (
      id, fixture_id, window_key, window_type, start_match_second, end_match_second,
      trading_close_match_second, title, status, market_id, data_quality_status
    )
    values (
      ${liveWindow.id}, ${liveWindow.fixtureId}, ${liveWindow.windowKey}, ${liveWindow.windowType},
      ${liveWindow.startMatchSecond}, ${liveWindow.endMatchSecond}, ${liveWindow.tradingCloseMatchSecond},
      ${liveWindow.title}, ${liveWindow.status}, ${liveWindow.marketId ?? null}, ${liveWindow.dataQualityStatus}
    )
    on conflict (id) do update set
      fixture_id = excluded.fixture_id,
      window_key = excluded.window_key,
      window_type = excluded.window_type,
      start_match_second = excluded.start_match_second,
      end_match_second = excluded.end_match_second,
      trading_close_match_second = excluded.trading_close_match_second,
      title = excluded.title,
      status = excluded.status,
      market_id = excluded.market_id,
      data_quality_status = excluded.data_quality_status
  `;
}

async function insertMarket(sql: QuerySql, market: Market): Promise<void> {
  await sql`
    insert into markets (
      id, live_window_id, market_key, title, status, market_address, tx_hash,
      volume_raw, liquidity_raw, oracle_state, data_quality_status
    )
    values (
      ${market.id}, ${market.liveWindowId}, ${market.marketKey}, ${market.title}, ${market.status},
      ${market.marketAddress ?? null}, ${market.txHash ?? null}, ${market.volumeRaw}, ${market.liquidityRaw},
      ${market.oracleState}, ${market.dataQualityStatus}
    )
    on conflict (id) do update set
      live_window_id = excluded.live_window_id,
      market_key = excluded.market_key,
      title = excluded.title,
      status = excluded.status,
      market_address = excluded.market_address,
      tx_hash = excluded.tx_hash,
      volume_raw = excluded.volume_raw,
      liquidity_raw = excluded.liquidity_raw,
      oracle_state = excluded.oracle_state,
      data_quality_status = excluded.data_quality_status
  `;
}

async function insertOutcome(sql: QuerySql, marketId: string, outcome: MarketOutcome): Promise<void> {
  await sql`
    insert into market_outcomes (market_id, outcome_index, label, probability_bps, token_id)
    values (${marketId}, ${outcome.outcomeIndex}, ${outcome.label}, ${outcome.probabilityBps}, ${outcome.tokenId ?? null})
    on conflict (market_id, outcome_index) do update set
      label = excluded.label,
      probability_bps = excluded.probability_bps,
      token_id = excluded.token_id
  `;
}

async function insertMatchEvent(sql: QuerySql, event: MatchEvent): Promise<void> {
  await sql`
    insert into match_events (
      id, fixture_id, provider_event_id, event_type, team, match_minute,
      match_second, is_confirmed, is_cancelled, source
    )
    values (
      ${event.id}, ${event.fixtureId}, ${event.providerEventId}, ${event.eventType}, ${event.team},
      ${event.matchMinute}, ${event.matchSecond}, ${event.isConfirmed}, ${event.isCancelled}, ${event.source}
    )
    on conflict (fixture_id, provider_event_id) do update set
      id = excluded.id,
      event_type = excluded.event_type,
      team = excluded.team,
      match_minute = excluded.match_minute,
      match_second = excluded.match_second,
      is_confirmed = excluded.is_confirmed,
      is_cancelled = excluded.is_cancelled,
      source = excluded.source
  `;
}

async function insertProposal(sql: QuerySql, proposal: ResultProposal): Promise<void> {
  await sql`
    insert into result_proposals (
      id, market_id, winning_outcome, goal_count_in_window, evidence_uri,
      challenge_deadline, status, tx_hash
    )
    values (
      ${proposal.id}, ${proposal.marketId}, ${proposal.winningOutcome}, ${proposal.goalCountInWindow},
      ${proposal.evidenceUri}, ${proposal.challengeDeadline}, ${proposal.status}, ${proposal.txHash ?? null}
    )
    on conflict (id) do update set
      market_id = excluded.market_id,
      winning_outcome = excluded.winning_outcome,
      goal_count_in_window = excluded.goal_count_in_window,
      evidence_uri = excluded.evidence_uri,
      challenge_deadline = excluded.challenge_deadline,
      status = excluded.status,
      tx_hash = excluded.tx_hash
  `;
}

async function insertOddsSnapshot(sql: QuerySql, snapshot: OddsSnapshot): Promise<void> {
  await sql`
    insert into odds_snapshots (id, market_id, provider, outcome_probabilities_bps, source_timestamp, ingested_at, raw)
    values (
      ${snapshot.id}, ${snapshot.marketId}, ${snapshot.provider}, ${sql.json(toJson(snapshot.outcomeProbabilitiesBps))},
      ${snapshot.sourceTimestamp}, ${snapshot.ingestedAt}, ${sql.json(toJson(snapshot.raw))}
    )
    on conflict (id) do update set
      market_id = excluded.market_id,
      provider = excluded.provider,
      outcome_probabilities_bps = excluded.outcome_probabilities_bps,
      source_timestamp = excluded.source_timestamp,
      ingested_at = excluded.ingested_at,
      raw = excluded.raw
  `;
}

async function insertOddsComparison(sql: QuerySql, comparison: OddsComparison): Promise<void> {
  await sql`
    insert into odds_comparisons (id, market_id, status, max_deviation_bps, mismatches, compared_at)
    values (
      ${comparison.id}, ${comparison.marketId}, ${comparison.status}, ${comparison.maxDeviationBps},
      ${sql.json(toJson(comparison.mismatches))}, ${comparison.comparedAt}
    )
    on conflict (id) do update set
      market_id = excluded.market_id,
      status = excluded.status,
      max_deviation_bps = excluded.max_deviation_bps,
      mismatches = excluded.mismatches,
      compared_at = excluded.compared_at
  `;
}

async function insertFeatureFlags(sql: QuerySql, flags: CommercialFeatureFlags): Promise<void> {
  for (const [key, enabled] of Object.entries(flags)) {
    await sql`
      insert into feature_flags (key, enabled, environment, updated_by, updated_at)
      values (${key}, ${enabled}, 'local', 'system', ${new Date("2026-06-13T22:20:00.000Z").toISOString()})
      on conflict (key) do update set
        enabled = excluded.enabled,
        environment = excluded.environment,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `;
  }
}

async function insertRiskLimit(sql: QuerySql, limit: RiskLimit): Promise<void> {
  const id = `${limit.scope}:${limit.subjectId}`;
  await sql`
    insert into risk_limits (
      id, scope, subject_id, max_order_amount_raw, max_user_exposure_raw,
      max_market_volume_raw, enabled
    )
    values (
      ${id}, ${limit.scope}, ${limit.subjectId}, ${limit.maxOrderAmountRaw},
      ${limit.maxUserExposureRaw}, ${limit.maxMarketVolumeRaw}, ${limit.enabled}
    )
    on conflict (scope, subject_id) do update set
      max_order_amount_raw = excluded.max_order_amount_raw,
      max_user_exposure_raw = excluded.max_user_exposure_raw,
      max_market_volume_raw = excluded.max_market_volume_raw,
      enabled = excluded.enabled,
      updated_at = now()
  `;
}

async function insertProviderHealth(sql: QuerySql, check: ProviderHealthCheck): Promise<void> {
  await sql`
    insert into provider_health_checks (id, provider, status, latency_ms, last_update_age_seconds, checked_at, details)
    values (
      ${check.id}, ${check.provider}, ${check.status}, ${check.latencyMs},
      ${check.lastUpdateAgeSeconds}, ${check.checkedAt}, ${sql.json(toJson(check.details))}
    )
    on conflict (id) do update set
      provider = excluded.provider,
      status = excluded.status,
      latency_ms = excluded.latency_ms,
      last_update_age_seconds = excluded.last_update_age_seconds,
      checked_at = excluded.checked_at,
      details = excluded.details
  `;
}

async function insertOperatorAction(sql: QuerySql, action: OperatorAction): Promise<void> {
  await sql`
    insert into operator_actions (id, operator_id, action_type, target_type, target_id, reason, created_at)
    values (${action.id}, ${action.operatorId}, ${action.actionType}, ${action.targetType}, ${action.targetId}, ${action.reason}, ${action.createdAt})
    on conflict (id) do update set
      operator_id = excluded.operator_id,
      action_type = excluded.action_type,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      reason = excluded.reason,
      created_at = excluded.created_at
  `;
}

async function insertAuditLog(sql: QuerySql, log: AuditLog): Promise<void> {
  await sql`
    insert into audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
    values (${log.id}, ${log.actorId}, ${log.action}, ${log.targetType}, ${log.targetId}, ${sql.json(toJson(log.metadata))}, ${log.createdAt})
    on conflict (id) do update set
      actor_id = excluded.actor_id,
      action = excluded.action,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      metadata = excluded.metadata,
      created_at = excluded.created_at
  `;
}

async function insertMarketPause(sql: QuerySql, pause: MarketPause): Promise<void> {
  await sql`
    insert into market_pauses (id, market_id, status, reason, paused_by, paused_at, resolved_at)
    values (${pause.id}, ${pause.marketId}, ${pause.status}, ${pause.reason}, ${pause.pausedBy}, ${pause.pausedAt}, ${pause.resolvedAt ?? null})
    on conflict (id) do update set
      market_id = excluded.market_id,
      status = excluded.status,
      reason = excluded.reason,
      paused_by = excluded.paused_by,
      paused_at = excluded.paused_at,
      resolved_at = excluded.resolved_at
  `;
}

async function insertLiquiditySnapshot(sql: QuerySql, snapshot: LiquiditySnapshot): Promise<void> {
  await sql`
    insert into liquidity_snapshots (id, market_id, liquidity_raw, volume_raw, inventory_risk_bps, captured_at)
    values (${snapshot.id}, ${snapshot.marketId}, ${snapshot.liquidityRaw}, ${snapshot.volumeRaw}, ${snapshot.inventoryRiskBps}, ${snapshot.capturedAt})
    on conflict (id) do update set
      market_id = excluded.market_id,
      liquidity_raw = excluded.liquidity_raw,
      volume_raw = excluded.volume_raw,
      inventory_risk_bps = excluded.inventory_risk_bps,
      captured_at = excluded.captured_at
  `;
}

async function insertChallenge(sql: QuerySql, challenge: Challenge): Promise<void> {
  await sql`
    insert into challenges (
      id, result_proposal_id, challenger_address, reason, evidence_uri, bond_amount_raw,
      challenge_tx_hash, status, reviewed_by, review_note, created_at, updated_at
    )
    values (
      ${challenge.id}, ${challenge.resultProposalId}, ${challenge.challengerAddress}, ${challenge.reason},
      ${challenge.evidenceUri}, ${challenge.bondAmountRaw}, ${null}, ${challenge.status},
      ${challenge.reviewedBy ?? null}, ${challenge.reviewNote ?? null}, ${challenge.createdAt}, ${challenge.updatedAt}
    )
    on conflict (id) do update set
      result_proposal_id = excluded.result_proposal_id,
      challenger_address = excluded.challenger_address,
      reason = excluded.reason,
      evidence_uri = excluded.evidence_uri,
      bond_amount_raw = excluded.bond_amount_raw,
      status = excluded.status,
      reviewed_by = excluded.reviewed_by,
      review_note = excluded.review_note,
      updated_at = excluded.updated_at
  `;
}

async function insertIndexedBlock(sql: QuerySql, block: IndexedBlock): Promise<void> {
  await sql`
    insert into indexed_blocks (chain_id, block_number, block_hash, indexed_at)
    values (${block.chainId}, ${block.blockNumber.toString()}, ${block.blockHash}, ${block.indexedAt})
    on conflict (chain_id, block_number) do update set
      block_hash = excluded.block_hash,
      indexed_at = excluded.indexed_at
  `;
}

async function insertTrade(sql: QuerySql, trade: Trade): Promise<void> {
  await sql`
    insert into trades (
      id, market_id, wallet_address, outcome_index,
      collateral_amount_raw, shares_amount_raw, trade_type
    )
    values (
      ${trade.id}, ${trade.marketId}, ${trade.walletAddress}, ${trade.outcomeIndex},
      ${trade.collateralAmountRaw}, ${trade.sharesAmountRaw}, ${trade.tradeType}
    )
    on conflict (id) do update set
      market_id = excluded.market_id,
      wallet_address = excluded.wallet_address,
      outcome_index = excluded.outcome_index,
      collateral_amount_raw = excluded.collateral_amount_raw,
      shares_amount_raw = excluded.shares_amount_raw,
      trade_type = excluded.trade_type
  `;
}

async function insertRedemption(sql: QuerySql, redemption: Redemption): Promise<void> {
  await sql`
    insert into redemptions (
      id, market_id, wallet_address, outcome_index,
      shares_burned_raw, collateral_paid_raw
    )
    values (
      ${redemption.id}, ${redemption.marketId}, ${redemption.walletAddress}, ${redemption.outcomeIndex},
      ${redemption.sharesBurnedRaw}, ${redemption.collateralPaidRaw}
    )
    on conflict (id) do update set
      market_id = excluded.market_id,
      wallet_address = excluded.wallet_address,
      outcome_index = excluded.outcome_index,
      shares_burned_raw = excluded.shares_burned_raw,
      collateral_paid_raw = excluded.collateral_paid_raw
  `;
}

async function insertCommercialMarketDefinition(sql: QuerySql, market: CommercialMarketDefinition): Promise<void> {
  await sql`
    insert into commercial_market_definitions (
      id, fixture_id, market_type, window_key, title, start_match_second, end_match_second,
      trading_close_match_second, outcomes, resolution_policy, risk_level, chain_creation_enabled
    )
    values (
      ${market.id}, ${market.fixtureId}, ${market.marketType}, ${market.windowKey}, ${market.title},
      ${market.startMatchSecond}, ${market.endMatchSecond}, ${market.tradingCloseMatchSecond},
      ${sql.json(toJson(market.outcomes))}, ${market.resolutionPolicy}, ${market.riskLevel},
      ${market.chainCreationEnabled}
    )
    on conflict (id) do update set
      fixture_id = excluded.fixture_id,
      market_type = excluded.market_type,
      window_key = excluded.window_key,
      title = excluded.title,
      start_match_second = excluded.start_match_second,
      end_match_second = excluded.end_match_second,
      trading_close_match_second = excluded.trading_close_match_second,
      outcomes = excluded.outcomes,
      resolution_policy = excluded.resolution_policy,
      risk_level = excluded.risk_level,
      chain_creation_enabled = excluded.chain_creation_enabled
  `;
}

async function insertRefundRequest(sql: QuerySql, refund: RefundRequest): Promise<void> {
  await sql`
    insert into refund_requests (id, market_id, wallet_address, status, reason, created_at)
    values (${refund.id}, ${refund.marketId}, ${refund.walletAddress}, ${refund.status}, ${refund.reason}, ${refund.createdAt})
    on conflict (id) do update set
      market_id = excluded.market_id,
      wallet_address = excluded.wallet_address,
      status = excluded.status,
      reason = excluded.reason,
      created_at = excluded.created_at
  `;
}

export async function persistPostgresState(sql: QuerySql, state: DbState): Promise<void> {
  for (const team of state.teams) await insertTeam(sql, team);
  for (const fixture of state.fixtures) await insertFixture(sql, fixture);
  for (const snapshot of state.snapshots) await insertSnapshot(sql, snapshot);
  for (const comparison of state.comparisons) await insertComparison(sql, comparison);
  for (const liveWindow of state.liveWindows) await insertLiveWindow(sql, liveWindow);
  for (const market of state.markets) {
    await insertMarket(sql, market);
    for (const outcome of market.outcomes) await insertOutcome(sql, market.id, outcome);
  }
  for (const event of state.events) await insertMatchEvent(sql, event);
  for (const snapshot of state.oddsSnapshots) await insertOddsSnapshot(sql, snapshot);
  for (const comparison of state.oddsComparisons) await insertOddsComparison(sql, comparison);
  for (const proposal of state.proposals) await insertProposal(sql, proposal);
  for (const trade of state.trades) await insertTrade(sql, trade);
  for (const redemption of state.redemptions) await insertRedemption(sql, redemption);
  await insertFeatureFlags(sql, state.featureFlags);
  for (const limit of state.riskLimits) await insertRiskLimit(sql, limit);
  for (const check of state.providerHealthChecks) await insertProviderHealth(sql, check);
  for (const action of state.operatorActions) await insertOperatorAction(sql, action);
  for (const log of state.auditLogs) await insertAuditLog(sql, log);
  for (const pause of state.marketPauses) await insertMarketPause(sql, pause);
  for (const snapshot of state.liquiditySnapshots) await insertLiquiditySnapshot(sql, snapshot);
  for (const market of state.commercialMarkets) await insertCommercialMarketDefinition(sql, market);
  for (const challenge of state.challenges) await insertChallenge(sql, challenge);
  for (const refund of state.refunds) await insertRefundRequest(sql, refund);
  for (const block of state.indexedBlocks) await insertIndexedBlock(sql, block);
}

export async function loadPostgresState(sql: QuerySql): Promise<DbState> {
  const base = createDemoState();
  const teams = (await sql<Array<Team & { fifaCode: string }>>`
    select id, name, fifa_code as "fifaCode", confederation, qualified_status as "qualifiedStatus"
    from teams
    order by id
  `).map((team) => ({ id: team.id, name: team.name, fifaCode: team.fifaCode, confederation: team.confederation, qualifiedStatus: team.qualifiedStatus }));
  const fixtures = (await sql<Array<Fixture>>`
    select
      id,
      fifa_match_id as "fifaMatchId",
      match_number as "matchNumber",
      home_team as "homeTeam",
      away_team as "awayTeam",
      status,
      home_score as "homeScore",
      away_score as "awayScore",
      match_second as "matchSecond",
      display_clock as "displayClock",
      venue,
      kickoff_at_utc as "kickoffAtUtc",
      data_quality_status as "dataQualityStatus"
    from fixtures
    order by kickoff_at_utc, id
  `).map((fixture) => ({ ...fixture, kickoffAtUtc: new Date(fixture.kickoffAtUtc).toISOString() }));
  const snapshots = (await sql<Array<DataSourceSnapshot>>`
    select
      id,
      subject_key as "subjectKey",
      source,
      payload_hash as "payloadHash",
      payload,
      source_timestamp as "sourceTimestamp",
      ingested_at as "ingestedAt"
    from data_source_snapshots
    order by id
  `).map((snapshot) => ({ ...snapshot, sourceTimestamp: new Date(snapshot.sourceTimestamp).toISOString(), ingestedAt: new Date(snapshot.ingestedAt).toISOString() }));
  const comparisons = await sql<Array<DataComparison>>`
    select
      id,
      subject_type as "subjectType",
      subject_key as "subjectKey",
      status,
      critical_mismatch_count as "criticalMismatchCount",
      warnings,
      mismatches
    from data_comparisons
    order by id
  `;
  const liveWindows = await sql<Array<LiveWindow>>`
    select
      id,
      fixture_id as "fixtureId",
      window_key as "windowKey",
      window_type as "windowType",
      start_match_second as "startMatchSecond",
      end_match_second as "endMatchSecond",
      trading_close_match_second as "tradingCloseMatchSecond",
      title,
      status,
      market_id as "marketId",
      data_quality_status as "dataQualityStatus"
    from live_windows
    order by start_match_second, id
  `;
  const outcomeRows = await sql<Array<MarketOutcome & { marketId: string }>>`
    select
      market_id as "marketId",
      outcome_index as "outcomeIndex",
      label,
      probability_bps as "probabilityBps",
      token_id as "tokenId"
    from market_outcomes
    order by market_id, outcome_index
  `;
  const markets = (await sql<Array<Omit<Market, "fixture" | "liveWindow" | "outcomes">>>`
    select
      id,
      live_window_id as "liveWindowId",
      market_key as "marketKey",
      title,
      status,
      market_address as "marketAddress",
      tx_hash as "txHash",
      volume_raw as "volumeRaw",
      liquidity_raw as "liquidityRaw",
      oracle_state as "oracleState",
      data_quality_status as "dataQualityStatus"
    from markets
    order by id
  `).map((marketRow): Market => {
    const liveWindow = liveWindows.find((candidate) => candidate.id === marketRow.liveWindowId);
    const fixture = fixtures.find((candidate) => candidate.id === liveWindow?.fixtureId);
    if (!liveWindow || !fixture) throw new Error(`Market ${marketRow.id} has missing fixture or live window`);
    return {
      ...marketRow,
      marketAddress: marketRow.marketAddress,
      txHash: marketRow.txHash,
      fixture,
      liveWindow,
      outcomes: outcomeRows.filter((outcome) => outcome.marketId === marketRow.id).map(({ marketId: _marketId, ...outcome }) => outcome),
    };
  });
  const events = await sql<Array<MatchEvent>>`
    select
      id,
      fixture_id as "fixtureId",
      provider_event_id as "providerEventId",
      event_type as "eventType",
      team,
      match_minute as "matchMinute",
      match_second as "matchSecond",
      is_confirmed as "isConfirmed",
      is_cancelled as "isCancelled",
      source
    from match_events
    order by id
  `;
  const proposals = (await sql<Array<ResultProposal>>`
    select
      id,
      market_id as "marketId",
      winning_outcome as "winningOutcome",
      goal_count_in_window as "goalCountInWindow",
      evidence_uri as "evidenceUri",
      challenge_deadline as "challengeDeadline",
      status,
      tx_hash as "txHash"
    from result_proposals
    order by id
  `).map((proposal) => ({ ...proposal, challengeDeadline: new Date(proposal.challengeDeadline).toISOString() }));
  const oddsSnapshots = (await sql<Array<OddsSnapshot>>`
    select
      id,
      market_id as "marketId",
      provider,
      outcome_probabilities_bps as "outcomeProbabilitiesBps",
      source_timestamp as "sourceTimestamp",
      ingested_at as "ingestedAt",
      raw
    from odds_snapshots
    order by id
  `).map((snapshot) => ({ ...snapshot, sourceTimestamp: new Date(snapshot.sourceTimestamp).toISOString(), ingestedAt: new Date(snapshot.ingestedAt).toISOString() }));
  const oddsComparisons = (await sql<Array<OddsComparison>>`
    select
      id,
      market_id as "marketId",
      status,
      max_deviation_bps as "maxDeviationBps",
      mismatches,
      compared_at as "comparedAt"
    from odds_comparisons
    order by id
  `).map((comparison) => ({ ...comparison, comparedAt: new Date(comparison.comparedAt).toISOString() }));
  const trades = await sql<Array<Trade>>`
    select
      id,
      market_id as "marketId",
      wallet_address as "walletAddress",
      outcome_index as "outcomeIndex",
      collateral_amount_raw as "collateralAmountRaw",
      shares_amount_raw as "sharesAmountRaw",
      trade_type as "tradeType"
    from trades
    order by id
  `;
  const redemptions = await sql<Array<Redemption>>`
    select
      id,
      market_id as "marketId",
      wallet_address as "walletAddress",
      outcome_index as "outcomeIndex",
      shares_burned_raw as "sharesBurnedRaw",
      collateral_paid_raw as "collateralPaidRaw"
    from redemptions
    order by id
  `;
  const featureFlagRows = await sql<Array<{ key: keyof CommercialFeatureFlags; enabled: boolean }>>`
    select key, enabled
    from feature_flags
    order by key
  `;
  const featureFlags = { ...base.featureFlags };
  for (const row of featureFlagRows) {
    if (row.key in featureFlags) featureFlags[row.key] = row.enabled;
  }
  const riskLimits = await sql<Array<RiskLimit>>`
    select
      scope,
      subject_id as "subjectId",
      max_order_amount_raw as "maxOrderAmountRaw",
      max_user_exposure_raw as "maxUserExposureRaw",
      max_market_volume_raw as "maxMarketVolumeRaw",
      enabled
    from risk_limits
    order by scope, subject_id
  `;
  const providerHealthChecks = (await sql<Array<ProviderHealthCheck>>`
    select
      id,
      provider,
      status,
      latency_ms as "latencyMs",
      last_update_age_seconds as "lastUpdateAgeSeconds",
      checked_at as "checkedAt",
      details
    from provider_health_checks
    order by checked_at, id
  `).map((check) => ({ ...check, checkedAt: new Date(check.checkedAt).toISOString() }));
  const operatorActions = (await sql<Array<OperatorAction>>`
    select
      id,
      operator_id as "operatorId",
      action_type as "actionType",
      target_type as "targetType",
      target_id as "targetId",
      reason,
      created_at as "createdAt"
    from operator_actions
    order by created_at, id
  `).map((action) => ({ ...action, createdAt: new Date(action.createdAt).toISOString() }));
  const auditLogs = (await sql<Array<AuditLog>>`
    select
      id,
      actor_id as "actorId",
      action,
      target_type as "targetType",
      target_id as "targetId",
      metadata,
      created_at as "createdAt"
    from audit_logs
    order by created_at, id
  `).map((log) => ({ ...log, createdAt: new Date(log.createdAt).toISOString() }));
  const marketPauses = (await sql<Array<MarketPause>>`
    select
      id,
      market_id as "marketId",
      status,
      reason,
      paused_by as "pausedBy",
      paused_at as "pausedAt",
      resolved_at as "resolvedAt"
    from market_pauses
    order by paused_at, id
  `).map((pause) => ({ ...pause, pausedAt: new Date(pause.pausedAt).toISOString(), resolvedAt: pause.resolvedAt ? new Date(pause.resolvedAt).toISOString() : undefined }));
  const liquiditySnapshots = (await sql<Array<LiquiditySnapshot>>`
    select
      id,
      market_id as "marketId",
      liquidity_raw as "liquidityRaw",
      volume_raw as "volumeRaw",
      inventory_risk_bps as "inventoryRiskBps",
      captured_at as "capturedAt"
    from liquidity_snapshots
    order by captured_at, id
  `).map((snapshot) => ({ ...snapshot, capturedAt: new Date(snapshot.capturedAt).toISOString() }));
  const commercialMarkets = await sql<Array<CommercialMarketDefinition>>`
    select
      id,
      fixture_id as "fixtureId",
      market_type as "marketType",
      window_key as "windowKey",
      title,
      start_match_second as "startMatchSecond",
      end_match_second as "endMatchSecond",
      trading_close_match_second as "tradingCloseMatchSecond",
      outcomes,
      resolution_policy as "resolutionPolicy",
      risk_level as "riskLevel",
      chain_creation_enabled as "chainCreationEnabled"
    from commercial_market_definitions
    order by start_match_second, id
  `;
  const challenges = (await sql<Array<Challenge>>`
    select
      id,
      result_proposal_id as "resultProposalId",
      challenger_address as "challengerAddress",
      reason,
      evidence_uri as "evidenceUri",
      bond_amount_raw as "bondAmountRaw",
      status,
      reviewed_by as "reviewedBy",
      review_note as "reviewNote",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from challenges
    order by created_at, id
  `).map((challenge) => ({ ...challenge, createdAt: new Date(challenge.createdAt).toISOString(), updatedAt: new Date(challenge.updatedAt).toISOString() }));
  const refunds = (await sql<Array<RefundRequest>>`
    select
      id,
      market_id as "marketId",
      wallet_address as "walletAddress",
      status,
      reason,
      created_at as "createdAt"
    from refund_requests
    order by created_at, id
  `).map((refund) => ({ ...refund, createdAt: new Date(refund.createdAt).toISOString() }));
  const indexedBlocks = (await sql<Array<{ chainId: number; blockNumber: string; blockHash: string; indexedAt: string }>>`
    select
      chain_id as "chainId",
      block_number::text as "blockNumber",
      block_hash as "blockHash",
      indexed_at as "indexedAt"
    from indexed_blocks
    order by chain_id, block_number
  `).map((block): IndexedBlock => ({ ...block, blockNumber: BigInt(block.blockNumber), indexedAt: new Date(block.indexedAt).toISOString() }));

  return {
    ...base,
    featureFlags,
    riskLimits,
    providerHealthChecks,
    operatorActions,
    auditLogs,
    marketPauses,
    liquiditySnapshots,
    commercialMarkets,
    indexedBlocks,
    challenges,
    refunds,
    teams,
    fixtures,
    snapshots,
    comparisons,
    liveWindows,
    markets,
    events,
    proposals,
    trades,
    redemptions,
    oddsSnapshots,
    oddsComparisons,
  };
}

async function seedPostgresDemoState(sql: QuerySql): Promise<{ market: Market; proposal: ResultProposal }> {
  const db = new InMemoryDb(createDemoState());
  const liveWindow = db.createLiveWindow({
    fixtureId: DEMO_FIXTURE_ID,
    startMatchSecond: DEMO_LIVE_WINDOW.startMatchSecond,
    endMatchSecond: DEMO_LIVE_WINDOW.endMatchSecond,
  });
  const market = db.createMarket(liveWindow.id);
  db.syncDemoLiveEvents("demo_goal");
  db.compareLiveEvents(DEMO_FIXTURE_ID, DEMO_LIVE_WINDOW.startMatchSecond, DEMO_LIVE_WINDOW.endMatchSecond);
  const proposal = db.proposeResult(market.id, "demo://postgres-real/full-flow");
  db.finalizeResult(market.id);

  await persistPostgresState(sql, db.state);

  return { market: db.getMarket(market.id)!, proposal };
}

async function count(sql: QuerySql, table: string): Promise<number> {
  const [row] = await sql.unsafe<Array<{ count: string }>>(`select count(*)::text as count from ${table}`);
  return Number(row?.count ?? 0);
}

export async function runPostgresRealFlow(databaseUrl: string, options: { reset?: boolean } = {}): Promise<PostgresRealFlowReport> {
  if (options.reset) assertResetIsSafe(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    await applyPostgresMigrations(sql);
    const result = await sql.begin(async (tx) => {
      if (options.reset) await resetPostgres(tx);
      const seeded = await seedPostgresDemoState(tx);
      const [marketRow] = await tx<Array<Pick<Market, "id" | "status" | "oracleState" | "marketAddress">>>`
        select id, status, oracle_state as "oracleState", market_address as "marketAddress"
        from markets
        where id = ${seeded.market.id}
      `;
      const [proposalRow] = await tx<Array<Pick<ResultProposal, "id" | "status" | "winningOutcome" | "goalCountInWindow" | "evidenceUri">>>`
        select
          id,
          status,
          winning_outcome as "winningOutcome",
          goal_count_in_window as "goalCountInWindow",
          evidence_uri as "evidenceUri"
        from result_proposals
        where id = ${seeded.proposal.id}
      `;
      if (!marketRow || !proposalRow) throw new Error("Postgres flow did not persist market and proposal rows");

      return {
        market: marketRow,
        proposal: proposalRow,
        counts: {
          teams: await count(tx, "teams"),
          fixtures: await count(tx, "fixtures"),
          dataSourceSnapshots: await count(tx, "data_source_snapshots"),
          dataComparisons: await count(tx, "data_comparisons"),
          liveWindows: await count(tx, "live_windows"),
          markets: await count(tx, "markets"),
          marketOutcomes: await count(tx, "market_outcomes"),
          matchEvents: await count(tx, "match_events"),
          oddsSnapshots: await count(tx, "odds_snapshots"),
          oddsComparisons: await count(tx, "odds_comparisons"),
          resultProposals: await count(tx, "result_proposals"),
        },
      };
    });

    return {
      ok: true,
      databaseMode: "postgres",
      databaseName: databaseName(databaseUrl),
      reset: options.reset ?? false,
      ...result,
    };
  } finally {
    await sql.end();
  }
}
