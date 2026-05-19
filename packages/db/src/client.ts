import { createHash } from "node:crypto";
import {
  CHALLENGE_WINDOW_SECONDS,
  DEFAULT_COMMERCIAL_FEATURE_FLAGS,
  DEFAULT_RISK_LIMITS,
  DEMO_FIXTURE,
  DEMO_FIXTURE_ID,
  DEMO_GOAL_EVENT,
  DEMO_LIVE_WINDOW,
  DEMO_LIVE_WINDOW_ID,
  DEMO_MARKET_ID,
  DEMO_MARKET_KEY,
  DEMO_OUTCOMES,
  DEMO_TEAMS,
  compareFixtureSnapshots,
  countConfirmedGoalsInWindow,
  makeWindowKey,
  outcomeForGoalCount,
  buildGoalWindowMarketDefinition,
  buildNextGoalMarketDefinition,
  type AuditLog,
  type CommercialFeatureFlags,
  type CommercialMarketDefinition,
  type CommercialMarketType,
  type DataComparison,
  type DataSourceSnapshot,
  type Fixture,
  type LiveWindow,
  type Market,
  type MatchEvent,
  type ResultProposal,
  type Team,
  type Trade,
  type Redemption,
  type RiskLimit,
  type RiskLimitScope,
  type ProviderHealthCheck,
  type ProviderHealthStatus,
  type OperatorAction,
  type MarketPause,
  type LiquiditySnapshot,
  type IndexedBlock,
  type Challenge,
  type ChallengeReviewStatus,
  type RefundRequest,
} from "@worldcup/shared";
import { syncDemoOdds, type OddsComparison, type OddsSnapshot } from "@worldcup/odds-ingestion";

export type DbState = {
  teams: Team[];
  fixtures: Fixture[];
  liveWindows: LiveWindow[];
  markets: Market[];
  snapshots: DataSourceSnapshot[];
  comparisons: DataComparison[];
  events: MatchEvent[];
  proposals: ResultProposal[];
  trades: Trade[];
  redemptions: Redemption[];
  featureFlags: CommercialFeatureFlags;
  riskLimits: RiskLimit[];
  providerHealthChecks: ProviderHealthCheck[];
  operatorActions: OperatorAction[];
  auditLogs: AuditLog[];
  marketPauses: MarketPause[];
  liquiditySnapshots: LiquiditySnapshot[];
  commercialMarkets: CommercialMarketDefinition[];
  indexedBlocks: IndexedBlock[];
  challenges: Challenge[];
  refunds: RefundRequest[];
  oddsSnapshots: OddsSnapshot[];
  oddsComparisons: OddsComparison[];
};

export function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export function createDemoState(): DbState {
  const now = new Date("2026-06-13T22:03:00.000Z").toISOString();
  const officialSnapshot = makeSnapshot("fixture:demo-2026-001", "fifa_official", DEMO_FIXTURE, now);
  const providerSnapshot = makeSnapshot("fixture:demo-2026-001", "sports_data_provider", DEMO_FIXTURE, now);
  const comparison = makeFixtureComparison(DEMO_FIXTURE, DEMO_FIXTURE);

  return {
    teams: [...DEMO_TEAMS],
    fixtures: [{ ...DEMO_FIXTURE }],
    liveWindows: [],
    markets: [],
    snapshots: [officialSnapshot, providerSnapshot],
    comparisons: [comparison],
    events: [],
    proposals: [],
    trades: [],
    redemptions: [],
    featureFlags: { ...DEFAULT_COMMERCIAL_FEATURE_FLAGS },
    riskLimits: [{ ...DEFAULT_RISK_LIMITS }],
    providerHealthChecks: [],
    operatorActions: [],
    auditLogs: [],
    marketPauses: [],
    liquiditySnapshots: [],
    commercialMarkets: [],
    indexedBlocks: [],
    challenges: [],
    refunds: [],
    oddsSnapshots: [],
    oddsComparisons: [],
  };
}

export function makeSnapshot(subjectKey: string, source: "fifa_official" | "sports_data_provider", payload: unknown, timestamp: string): DataSourceSnapshot {
  return {
    id: `${subjectKey}:${source}`,
    subjectKey,
    source,
    payloadHash: payloadHash(payload),
    payload,
    sourceTimestamp: timestamp,
    ingestedAt: timestamp,
  };
}

export function makeFixtureComparison(official: Fixture, provider: Fixture): DataComparison {
  const result = compareFixtureSnapshots(official, provider);
  return {
    id: `comparison:fixture:${official.fifaMatchId}`,
    subjectType: "fixture",
    subjectKey: `fixture:${official.fifaMatchId}`,
    status: result.status,
    criticalMismatchCount: result.mismatches.filter((mismatch) => mismatch.severity === "critical").length,
    warnings: result.mismatches.filter((mismatch) => mismatch.severity === "warning"),
    mismatches: result.mismatches,
  };
}

export class InMemoryDb {
  constructor(public readonly state: DbState = createDemoState()) {}

  listFixtures(status?: string): Fixture[] {
    return this.state.fixtures.filter((fixture) => !status || fixture.status === status);
  }

  getFixture(fixtureId: string): Fixture | undefined {
    return this.state.fixtures.find((fixture) => fixture.id === fixtureId || fixture.fifaMatchId === fixtureId);
  }

  getComparison(subjectType: DataComparison["subjectType"], subjectKey: string): DataComparison | undefined {
    return this.state.comparisons.find((comparison) => comparison.subjectType === subjectType && comparison.subjectKey === subjectKey);
  }

  upsertComparison(comparison: DataComparison): DataComparison {
    const index = this.state.comparisons.findIndex((candidate) => candidate.subjectType === comparison.subjectType && candidate.subjectKey === comparison.subjectKey);
    if (index >= 0) this.state.comparisons[index] = comparison;
    else this.state.comparisons.push(comparison);
    return comparison;
  }

  injectFixtureMismatch(fixtureId: string, field: keyof Fixture, providerValue: unknown): DataComparison {
    const fixture = this.getFixture(fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });
    const provider = { ...fixture, [field]: providerValue } as Fixture;
    const comparison = makeFixtureComparison(fixture, provider);
    fixture.dataQualityStatus = comparison.status;
    return this.upsertComparison(comparison);
  }

  createLiveWindow(input: { fixtureId: string; startMatchSecond: number; endMatchSecond: number }): LiveWindow {
    const fixture = this.getFixture(input.fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });
    const comparison = this.getComparison("fixture", `fixture:${fixture.fifaMatchId}`);
    if (comparison?.status !== "verified") throw Object.assign(new Error("Fixture data has critical mismatches and cannot create a market"), { code: "DATA_QUALITY_REVIEW_REQUIRED" });
    const windowKey = makeWindowKey(fixture.id, input.startMatchSecond, input.endMatchSecond);
    const existing = this.state.liveWindows.find((window) => window.windowKey === windowKey);
    if (existing) return existing;
    const isDemoWindow = fixture.id === DEMO_FIXTURE_ID && input.startMatchSecond === DEMO_LIVE_WINDOW.startMatchSecond && input.endMatchSecond === DEMO_LIVE_WINDOW.endMatchSecond;
    const liveWindow: LiveWindow = {
      ...DEMO_LIVE_WINDOW,
      id: isDemoWindow ? DEMO_LIVE_WINDOW_ID : `live-window:${fixture.id}:${input.startMatchSecond}:${input.endMatchSecond}`,
      fixtureId: fixture.id,
      windowKey,
      startMatchSecond: input.startMatchSecond,
      endMatchSecond: input.endMatchSecond,
      tradingCloseMatchSecond: Math.max(input.startMatchSecond, input.endMatchSecond - 30),
      title: `${fixture.homeTeam} vs ${fixture.awayTeam}, ${Math.floor(input.startMatchSecond / 60)}:00-${Math.floor(input.endMatchSecond / 60)}:00 - will either team score a goal?`,
      dataQualityStatus: comparison.status,
    };
    this.state.liveWindows.push(liveWindow);
    return liveWindow;
  }

  listLiveWindows(status?: string): LiveWindow[] {
    return this.state.liveWindows.filter((window) => !status || window.status === status);
  }

  createMarket(liveWindowId: string): Market {
    const liveWindow = this.state.liveWindows.find((candidate) => candidate.id === liveWindowId);
    if (!liveWindow) throw Object.assign(new Error("Live window not found"), { code: "LIVE_WINDOW_NOT_FOUND" });
    if (liveWindow.dataQualityStatus !== "verified") throw Object.assign(new Error("Fixture data has critical mismatches and cannot create a market"), { code: "DATA_QUALITY_REVIEW_REQUIRED" });
    const existing = this.state.markets.find((market) => market.liveWindowId === liveWindowId);
    if (existing) return existing;
    const fixture = this.getFixture(liveWindow.fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });
    const isDemoWindow = liveWindow.windowKey === makeWindowKey(DEMO_FIXTURE_ID, DEMO_LIVE_WINDOW.startMatchSecond, DEMO_LIVE_WINDOW.endMatchSecond);
    const marketId = isDemoWindow ? DEMO_MARKET_ID : `market:${liveWindow.fixtureId}:${liveWindow.startMatchSecond}:${liveWindow.endMatchSecond}`;
    const market: Market = {
      id: marketId,
      liveWindowId,
      marketKey: liveWindow.windowKey,
      title: liveWindow.title,
      status: "live_trading",
      fixture,
      liveWindow: { ...liveWindow, marketId },
      outcomes: DEMO_OUTCOMES.map((outcome) => ({ ...outcome })),
      marketAddress: "0x0000000000000000000000000000000000001001",
      txHash: deterministicTxHash(`create-market:${liveWindow.windowKey}`),
      volumeRaw: "0",
      liquidityRaw: "2000000000",
      oracleState: "none",
      dataQualityStatus: "verified",
    };
    liveWindow.marketId = market.id;
    this.state.markets.push(market);
    this.syncDemoMarketOdds(market.id);
    return market;
  }

  listMarkets(status?: string): Market[] {
    return this.state.markets.filter((market) => !status || market.status === status);
  }

  getMarket(marketId: string): Market | undefined {
    return this.state.markets.find((market) => market.id === marketId || market.marketKey === marketId);
  }

  compareFixtureData(fixtureId: string): DataComparison {
    const fixture = this.getFixture(fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });
    const official = this.state.snapshots.find((snapshot) => snapshot.subjectKey === `fixture:${fixture.id}` && snapshot.source === "fifa_official");
    const provider = this.state.snapshots.find((snapshot) => snapshot.subjectKey === `fixture:${fixture.id}` && snapshot.source === "sports_data_provider");
    if (!official || !provider) throw Object.assign(new Error("Fixture snapshots missing"), { code: "FIXTURE_SNAPSHOTS_MISSING" });
    const comparison = makeFixtureComparison(official.payload as Fixture, provider.payload as Fixture);
    fixture.dataQualityStatus = comparison.status;
    return this.upsertComparison(comparison);
  }

  listTeams(): Team[] {
    return this.state.teams;
  }

  listSchedule(): Fixture[] {
    return [...this.state.fixtures].sort((left, right) => left.kickoffAtUtc.localeCompare(right.kickoffAtUtc));
  }

  syncDemoMarketOdds(marketId = DEMO_MARKET_ID, providerProbabilityBps = 5100): OddsComparison {
    const market = this.getMarket(marketId);
    if (!market) throw Object.assign(new Error("Market not found"), { code: "MARKET_NOT_FOUND" });
    const { snapshots, comparison } = syncDemoOdds({ marketId, providerProbabilityBps });
    for (const snapshot of snapshots) {
      const index = this.state.oddsSnapshots.findIndex((candidate) => candidate.id === snapshot.id);
      if (index >= 0) this.state.oddsSnapshots[index] = snapshot;
      else this.state.oddsSnapshots.push(snapshot);
    }
    const comparisonIndex = this.state.oddsComparisons.findIndex((candidate) => candidate.id === comparison.id);
    if (comparisonIndex >= 0) this.state.oddsComparisons[comparisonIndex] = comparison;
    else this.state.oddsComparisons.push(comparison);
    return comparison;
  }

  getMarketOddsComparison(marketId: string): OddsComparison | undefined {
    return this.state.oddsComparisons.find((comparison) => comparison.marketId === marketId);
  }

  syncDemoLiveEvents(mode: "demo_goal" | "demo_no_goal" | "demo_cancelled_goal"): { inserted: number; updated: number; events: MatchEvent[] } {
    if (mode === "demo_no_goal") return { inserted: 0, updated: 0, events: [] };
    const event = mode === "demo_cancelled_goal" ? { ...DEMO_GOAL_EVENT, isCancelled: true, eventType: "goal_cancelled" as const } : { ...DEMO_GOAL_EVENT };
    const existing = this.state.events.findIndex((candidate) => candidate.fixtureId === event.fixtureId && candidate.providerEventId === event.providerEventId);
    if (existing >= 0) {
      this.state.events[existing] = event;
      return { inserted: 0, updated: 1, events: [event] };
    }
    this.state.events.push(event);
    return { inserted: 1, updated: 0, events: [event] };
  }

  compareLiveEvents(fixtureId: string, startMatchSecond: number, endMatchSecond: number): DataComparison {
    const events = this.state.events.filter((event) => event.fixtureId === fixtureId);
    const mismatches = events.some((event) => event.eventType === "goal" && !event.isConfirmed)
      ? [{ field: "isConfirmed", officialValue: true, providerValue: false, severity: "critical" as const, action: "block_result_proposal" as const }]
      : [];
    const comparison: DataComparison = {
      id: `comparison:live_events:${fixtureId}:${startMatchSecond}:${endMatchSecond}`,
      subjectType: "live_events",
      subjectKey: `live_events:${fixtureId}:${startMatchSecond}:${endMatchSecond}`,
      status: mismatches.length > 0 ? "data_review_required" : "verified",
      criticalMismatchCount: mismatches.length,
      warnings: [],
      mismatches,
    };
    return this.upsertComparison(comparison);
  }

  proposeResult(marketId: string, evidenceUri: string, now = new Date("2026-06-13T22:15:00.000Z")): ResultProposal {
    const market = this.getMarket(marketId);
    if (!market) throw Object.assign(new Error("Market not found"), { code: "MARKET_NOT_FOUND" });
    const comparison = this.getComparison("live_events", `live_events:${market.fixture.id}:${market.liveWindow.startMatchSecond}:${market.liveWindow.endMatchSecond}`);
    if (comparison?.status !== "verified") throw Object.assign(new Error("Live event data must be verified before proposing result"), { code: "LIVE_EVENT_REVIEW_REQUIRED" });
    const existing = this.state.proposals.find((proposal) => proposal.marketId === market.id);
    if (existing) return existing;
    const goalCount = countConfirmedGoalsInWindow(this.state.events, market.liveWindow);
    const proposal: ResultProposal = {
      id: `proposal:${market.id}`,
      marketId: market.id,
      winningOutcome: outcomeForGoalCount(goalCount),
      goalCountInWindow: goalCount,
      evidenceUri,
      challengeDeadline: new Date(now.getTime() + CHALLENGE_WINDOW_SECONDS * 1000).toISOString(),
      status: "proposed",
      txHash: deterministicTxHash(`proposal:${market.id}:${goalCount}`),
    };
    market.status = "proposed";
    market.oracleState = "proposed";
    this.state.proposals.push(proposal);
    return proposal;
  }

  finalizeResult(marketId: string, now = new Date("2026-06-13T22:30:00.000Z")): ResultProposal {
    const market = this.getMarket(marketId);
    const proposal = this.state.proposals.find((candidate) => candidate.marketId === marketId);
    if (!market || !proposal) throw Object.assign(new Error("Proposal not found"), { code: "PROPOSAL_NOT_FOUND" });
    if (proposal.status === "challenged") throw Object.assign(new Error("Challenged proposal cannot be finalized automatically"), { code: "PROPOSAL_CHALLENGED" });
    if (now.getTime() < new Date(proposal.challengeDeadline).getTime()) throw Object.assign(new Error("Challenge window is still open"), { code: "CHALLENGE_WINDOW_OPEN" });
    proposal.status = "finalized";
    market.status = "redeemable";
    market.oracleState = "finalized";
    return proposal;
  }

  recordTrade(trade: Omit<Trade, "id">): Trade {
    const market = this.getMarket(trade.marketId);
    if (!market) throw Object.assign(new Error("Market not found"), { code: "MARKET_NOT_FOUND" });
    const saved: Trade = { ...trade, id: `trade:${this.state.trades.length + 1}` };
    market.volumeRaw = (BigInt(market.volumeRaw) + BigInt(trade.collateralAmountRaw)).toString();
    this.state.trades.push(saved);
    return saved;
  }

  recordRedemption(redemption: Omit<Redemption, "id">): Redemption {
    const saved: Redemption = { ...redemption, id: `redemption:${this.state.redemptions.length + 1}` };
    this.state.redemptions.push(saved);
    return saved;
  }

  getFeatureFlags(): CommercialFeatureFlags {
    return { ...this.state.featureFlags };
  }

  setFeatureFlag(flag: keyof CommercialFeatureFlags, value: boolean, operatorId: string): CommercialFeatureFlags {
    this.state.featureFlags[flag] = value;
    this.recordOperatorAction({ operatorId, actionType: "feature_flag_updated", targetType: "feature_flag", targetId: flag, reason: `set ${flag}=${value}` });
    this.recordAuditLog(operatorId, "feature_flag.updated", "feature_flag", flag, { value });
    return this.getFeatureFlags();
  }

  upsertRiskLimit(limit: RiskLimit): RiskLimit {
    const index = this.state.riskLimits.findIndex((candidate) => candidate.scope === limit.scope && candidate.subjectId === limit.subjectId);
    if (index >= 0) this.state.riskLimits[index] = limit;
    else this.state.riskLimits.push(limit);
    this.recordAuditLog("system", "risk_limit.upserted", "risk_limit", `${limit.scope}:${limit.subjectId}`, limit as unknown as Record<string, unknown>);
    return limit;
  }

  getRiskLimit(scope: RiskLimitScope, subjectId: string): RiskLimit | undefined {
    return this.state.riskLimits.find((limit) => limit.scope === scope && limit.subjectId === subjectId);
  }

  recordProviderHealth(input: Omit<ProviderHealthCheck, "id" | "checkedAt">): ProviderHealthCheck {
    const saved: ProviderHealthCheck = {
      ...input,
      id: `provider-health:${this.state.providerHealthChecks.length + 1}`,
      checkedAt: new Date("2026-06-13T22:16:00.000Z").toISOString(),
    };
    this.state.providerHealthChecks.push(saved);
    return saved;
  }

  autoPauseMarketForProviderDelay(marketId: string, reason: string): MarketPause {
    return this.pauseMarket(marketId, "system", reason);
  }

  pauseMarket(marketId: string, operatorId: string, reason: string): MarketPause {
    const pause: MarketPause = {
      id: `pause:${this.state.marketPauses.length + 1}`,
      marketId,
      status: "active",
      reason,
      pausedBy: operatorId,
      pausedAt: new Date("2026-06-13T22:17:00.000Z").toISOString(),
    };
    this.state.marketPauses.push(pause);
    const market = this.getMarket(marketId);
    if (market) market.status = "closed";
    this.recordOperatorAction({ operatorId, actionType: "market_paused", targetType: "market", targetId: marketId, reason });
    this.recordAuditLog(operatorId, "market.paused", "market", marketId, { reason });
    return pause;
  }

  resumeMarket(marketId: string, operatorId: string, reason: string): MarketPause {
    const pause = [...this.state.marketPauses].reverse().find((candidate) => candidate.marketId === marketId && candidate.status === "active");
    if (!pause) throw Object.assign(new Error("Active pause not found"), { code: "MARKET_PAUSE_NOT_FOUND" });
    pause.status = "resolved";
    pause.resolvedAt = new Date("2026-06-13T22:18:00.000Z").toISOString();
    const market = this.getMarket(marketId);
    if (market) market.status = "live_trading";
    this.recordOperatorAction({ operatorId, actionType: "market_resumed", targetType: "market", targetId: marketId, reason });
    this.recordAuditLog(operatorId, "market.resumed", "market", marketId, { reason });
    return pause;
  }

  createCommercialLiveWindow(input: { fixtureId: string; marketType: CommercialMarketType; startMatchSecond: number; endMatchSecond?: number }): CommercialMarketDefinition {
    const fixture = this.getFixture(input.fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });
    const existing = this.state.commercialMarkets.find((market) => market.fixtureId === input.fixtureId && market.marketType === input.marketType && market.startMatchSecond === input.startMatchSecond);
    if (existing) return existing;
    const definition = input.marketType === "next_goal_team"
      ? buildNextGoalMarketDefinition({ fixtureId: fixture.id, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, startMatchSecond: input.startMatchSecond, endMatchSecond: input.endMatchSecond ?? 5400 })
      : buildGoalWindowMarketDefinition({ fixtureId: fixture.id, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, startMatchSecond: input.startMatchSecond, durationMinutes: input.marketType === "goal_window_5m" ? 5 : input.marketType === "goal_window_15m" ? 15 : 10 });
    this.state.commercialMarkets.push(definition);
    return definition;
  }

  recordLiquiditySnapshot(snapshot: Omit<LiquiditySnapshot, "id" | "capturedAt">): LiquiditySnapshot {
    const saved: LiquiditySnapshot = { ...snapshot, id: `liquidity:${this.state.liquiditySnapshots.length + 1}`, capturedAt: new Date("2026-06-13T22:19:00.000Z").toISOString() };
    this.state.liquiditySnapshots.push(saved);
    return saved;
  }

  recordIndexedBlock(block: IndexedBlock): IndexedBlock {
    const index = this.state.indexedBlocks.findIndex((candidate) => candidate.chainId === block.chainId && candidate.blockNumber === block.blockNumber);
    if (index >= 0) this.state.indexedBlocks[index] = block;
    else this.state.indexedBlocks.push(block);
    return block;
  }


  createChallenge(input: Omit<Challenge, "id" | "status" | "createdAt" | "updatedAt">, now = new Date()): Challenge {
    const proposal = this.state.proposals.find((candidate) => candidate.id === input.resultProposalId);
    if (!proposal) throw Object.assign(new Error("Proposal not found"), { code: "PROPOSAL_NOT_FOUND" });
    if (proposal.status === "finalized") throw Object.assign(new Error("Proposal already finalized"), { code: "PROPOSAL_FINALIZED" });
    if (now.getTime() > new Date(proposal.challengeDeadline).getTime()) throw Object.assign(new Error("Challenge window is closed"), { code: "CHALLENGE_WINDOW_CLOSED" });
    proposal.status = "challenged";
    const market = this.getMarket(proposal.marketId);
    if (market) {
      market.status = "challenged";
      market.oracleState = "challenged";
    }
    const timestamp = now.toISOString();
    const saved: Challenge = { ...input, id: `challenge:${this.state.challenges.length + 1}`, status: "open", createdAt: timestamp, updatedAt: timestamp };
    this.state.challenges.push(saved);
    this.recordAuditLog("public", "challenge.created", "result_proposal", input.resultProposalId, { reason: input.reason });
    return saved;
  }

  reviewChallenge(challengeId: string, operatorId: string, status: Exclude<ChallengeReviewStatus, "open">, reviewNote: string): Challenge {
    const challenge = this.state.challenges.find((candidate) => candidate.id === challengeId);
    if (!challenge) throw Object.assign(new Error("Challenge not found"), { code: "CHALLENGE_NOT_FOUND" });
    challenge.status = status;
    challenge.reviewedBy = operatorId;
    challenge.reviewNote = reviewNote;
    challenge.updatedAt = new Date("2026-06-13T22:23:00.000Z").toISOString();
    this.recordOperatorAction({ operatorId, actionType: "challenge_reviewed", targetType: "challenge", targetId: challengeId, reason: reviewNote });
    this.recordAuditLog(operatorId, "challenge.reviewed", "challenge", challengeId, { status, reviewNote });
    return challenge;
  }

  voidMarketByOperator(marketId: string, operatorId: string, reason: string): Market {
    let market = this.getMarket(marketId);
    if (!market && marketId === DEMO_MARKET_ID) {
      const liveWindow = this.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: DEMO_LIVE_WINDOW.startMatchSecond, endMatchSecond: DEMO_LIVE_WINDOW.endMatchSecond });
      market = this.createMarket(liveWindow.id);
    }
    if (!market) throw Object.assign(new Error("Market not found"), { code: "MARKET_NOT_FOUND" });
    market.status = "voided";
    market.oracleState = "voided";
    this.recordOperatorAction({ operatorId, actionType: "market_voided", targetType: "market", targetId: marketId, reason });
    this.recordAuditLog(operatorId, "market.voided", "market", marketId, { reason });
    return market;
  }

  queueRefund(marketId: string, operatorId: string, walletAddress: `0x${string}`, reason: string): RefundRequest {
    const refund: RefundRequest = { id: `refund:${this.state.refunds.length + 1}`, marketId, walletAddress, status: "queued", reason, createdAt: new Date("2026-06-13T22:24:00.000Z").toISOString() };
    this.state.refunds.push(refund);
    this.recordOperatorAction({ operatorId, actionType: "market_voided", targetType: "market", targetId: marketId, reason: `refund queued: ${reason}` });
    this.recordAuditLog(operatorId, "market.refund_queued", "market", marketId, { walletAddress, reason });
    return refund;
  }

  recordAudit(actorId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): AuditLog {
    return this.recordAuditLog(actorId, action, targetType, targetId, metadata);
  }

  private recordOperatorAction(input: Omit<OperatorAction, "id" | "createdAt">): OperatorAction {
    const saved: OperatorAction = { ...input, id: `operator-action:${this.state.operatorActions.length + 1}`, createdAt: new Date("2026-06-13T22:20:00.000Z").toISOString() };
    this.state.operatorActions.push(saved);
    return saved;
  }

  private recordAuditLog(actorId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): AuditLog {
    const saved: AuditLog = { id: `audit:${this.state.auditLogs.length + 1}`, actorId, action, targetType, targetId, metadata, createdAt: new Date("2026-06-13T22:21:00.000Z").toISOString() };
    this.state.auditLogs.push(saved);
    return saved;
  }

}

export function deterministicTxHash(seed: string): `0x${string}` {
  return `0x${createHash("sha256").update(seed).digest("hex")}`;
}
