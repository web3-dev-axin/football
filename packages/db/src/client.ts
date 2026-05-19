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
  WORLDCUP_2026_GROUP_STAGE_FIXTURES,
  WORLDCUP_2026_TEAMS,
  compareFixtureSnapshots,
  countConfirmedGoalsInWindow,
  getXLayerMarketDeployment,
  makeWindowKey,
  outcomeForGoalCount,
  buildExactScoreMarketDefinition,
  buildMatchWinnerMarketDefinition,
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
} from "@polygoal/shared";
import { syncDemoOdds, type OddsComparison, type OddsSnapshot } from "@polygoal/odds-ingestion";

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
  const teams = mergeTeams(DEMO_TEAMS, WORLDCUP_2026_TEAMS);
  const fixtures = mergeFixtures([{ ...DEMO_FIXTURE }], WORLDCUP_2026_GROUP_STAGE_FIXTURES);
  const snapshots: DataSourceSnapshot[] = [];
  const comparisons: DataComparison[] = [];
  for (const fixture of fixtures) {
    snapshots.push(
      makeSnapshot(`fixture:${fixture.fifaMatchId}`, "fifa_official", fixture, now),
      makeSnapshot(`fixture:${fixture.fifaMatchId}`, "sports_data_provider", fixture, now),
    );
    comparisons.push(makeFixtureComparison(fixture, fixture));
  }

  const state: DbState = {
    teams,
    fixtures,
    liveWindows: [],
    markets: [],
    snapshots,
    comparisons,
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

  bootstrapCommercialMarketsInState(state);
  return state;
}

function mergeTeams(...sources: Team[][]): Team[] {
  const byId = new Map<string, Team>();
  for (const source of sources) {
    for (const team of source) {
      if (!byId.has(team.id)) byId.set(team.id, { ...team });
    }
  }
  return [...byId.values()];
}

function mergeFixtures(...sources: Fixture[][]): Fixture[] {
  const byId = new Map<string, Fixture>();
  for (const source of sources) {
    for (const fixture of source) {
      if (!byId.has(fixture.id)) byId.set(fixture.id, { ...fixture });
    }
  }
  return [...byId.values()].sort((left, right) => left.matchNumber - right.matchNumber);
}

function bootstrapCommercialMarketsInState(state: DbState): void {
  for (const fixture of state.fixtures) {
    for (const marketType of ["match_winner", "exact_score"] as const) {
      const exists = state.commercialMarkets.some(
        (market) => market.fixtureId === fixture.id && market.marketType === marketType,
      );
      if (exists) continue;
      const definition = marketType === "match_winner"
        ? buildMatchWinnerMarketDefinition({ fixtureId: fixture.id, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam })
        : buildExactScoreMarketDefinition({ fixtureId: fixture.id, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam });
      state.commercialMarkets.push(definition);
    }
  }
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
      title: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
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
      marketKey: isDemoWindow ? DEMO_MARKET_KEY : `fixture:${liveWindow.fixtureId}:match_winner`,
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

  listMatchEvents(fixtureId: string): MatchEvent[] {
    const fixture = this.getFixture(fixtureId);
    const keys = new Set<string>();
    keys.add(fixtureId);
    if (fixture) {
      keys.add(fixture.id);
      keys.add(fixture.fifaMatchId);
    }
    return this.state.events
      .filter((event) => keys.has(event.fixtureId))
      .sort((left, right) => left.matchSecond - right.matchSecond);
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

  /**
   * Demo-only: synthesize a realistic match event timeline for one or more fixtures so the
   * "Live feed" panel on the fixture/market pages has something to show without an upstream
   * provider. Events are deterministic per fixture id (same fixture → same timeline) so
   * re-runs are stable. Idempotent unless `force` is true.
   */
  seedDemoMatchEventsForFixtures(opts: { fixtureIds?: string[]; force?: boolean } = {}): { fixtureId: string; inserted: number; skipped: boolean }[] {
    const targets = opts.fixtureIds && opts.fixtureIds.length > 0
      ? opts.fixtureIds
          .map((id) => this.getFixture(id))
          .filter((fixture): fixture is Fixture => Boolean(fixture))
      : this.state.fixtures;

    const summary: { fixtureId: string; inserted: number; skipped: boolean }[] = [];

    for (const fixture of targets) {
      const existing = this.state.events.filter((event) => event.fixtureId === fixture.id || event.fixtureId === fixture.fifaMatchId);
      if (existing.length > 0 && !opts.force) {
        summary.push({ fixtureId: fixture.id, inserted: 0, skipped: true });
        continue;
      }
      if (opts.force && existing.length > 0) {
        this.state.events = this.state.events.filter((event) => event.fixtureId !== fixture.id && event.fixtureId !== fixture.fifaMatchId);
      }
      const events = synthesizeFixtureEvents(fixture);
      for (const event of events) this.state.events.push(event);
      summary.push({ fixtureId: fixture.id, inserted: events.length, skipped: false });
    }
    return summary;
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
    const winner = market.fixture.homeScore > market.fixture.awayScore ? 0 : market.fixture.homeScore === market.fixture.awayScore ? 1 : 2;
    const proposal: ResultProposal = {
      id: `proposal:${market.id}`,
      marketId: market.id,
      winningOutcome: market.marketKey.includes("match_winner") ? winner : outcomeForGoalCount(goalCount),
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

  // Demo-only: inject a settlement (Market + LiveWindow + ResultProposal) for a commercial
  // market without going through the live_events verification flow. Used by seed scripts and
  // the /admin/results/seed-demo endpoint so that the settlements UI has data even when
  // markets close in the future.
  seedDemoSettlementForCommercial(opts: {
    commercialMarketId: string;
    winningOutcome?: number;
    status?: ResultProposal["status"];
    challengeDeadline?: string;
    evidenceUri?: string;
    goalCountInWindow?: number;
    now?: Date;
  }): ResultProposal {
    const commercial = this.state.commercialMarkets.find((candidate) => candidate.id === opts.commercialMarketId);
    if (!commercial) throw Object.assign(new Error("Commercial market not found"), { code: "COMMERCIAL_MARKET_NOT_FOUND" });
    const fixture = this.state.fixtures.find((candidate) => candidate.id === commercial.fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });

    const status: ResultProposal["status"] = opts.status ?? "proposed";
    const winningOutcome = Math.max(0, Math.min(commercial.outcomes.length - 1, opts.winningOutcome ?? 0));
    const now = opts.now ?? new Date();
    const defaultDeadline = status === "proposed"
      ? new Date(now.getTime() + 30 * 60_000).toISOString()
      : new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const challengeDeadline = opts.challengeDeadline ?? defaultDeadline;
    const marketStatus = status === "finalized" ? "redeemable" : status === "voided" ? "voided" : status === "challenged" ? "challenged" : "proposed";
    const oracleState = status === "finalized" ? "finalized" : status;

    let liveWindow = this.state.liveWindows.find((candidate) => candidate.windowKey === commercial.windowKey);
    if (!liveWindow) {
      liveWindow = {
        id: `${commercial.id}:window`,
        fixtureId: fixture.id,
        windowKey: commercial.windowKey,
        windowType: "goal_in_next_10_minutes",
        startMatchSecond: commercial.startMatchSecond,
        endMatchSecond: commercial.endMatchSecond,
        tradingCloseMatchSecond: commercial.tradingCloseMatchSecond,
        title: commercial.title,
        status: "closed",
        dataQualityStatus: fixture.dataQualityStatus,
      };
      this.state.liveWindows.push(liveWindow);
    }

    const deployment = getXLayerMarketDeployment(commercial.windowKey);
    let market = this.state.markets.find((candidate) => candidate.id === commercial.id);
    if (!market) {
      market = {
        id: commercial.id,
        liveWindowId: liveWindow.id,
        marketKey: commercial.windowKey,
        title: commercial.title,
        status: marketStatus,
        fixture,
        liveWindow: { ...liveWindow, marketId: commercial.id },
        outcomes: commercial.outcomes.map((outcome) => ({ outcomeIndex: outcome.outcomeIndex, label: outcome.label, probabilityBps: outcome.probabilityBps })),
        marketAddress: deployment?.marketAddress,
        txHash: deployment?.txHash,
        volumeRaw: "0",
        liquidityRaw: "0",
        oracleState,
        dataQualityStatus: fixture.dataQualityStatus,
      };
      liveWindow.marketId = market.id;
      this.state.markets.push(market);
    } else {
      market.status = marketStatus;
      market.oracleState = oracleState;
      if (!market.marketAddress && deployment?.marketAddress) market.marketAddress = deployment.marketAddress;
      if (!market.txHash && deployment?.txHash) market.txHash = deployment.txHash;
    }

    const proposalId = `proposal:${commercial.id}`;
    let proposal = this.state.proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal) {
      proposal = {
        id: proposalId,
        marketId: commercial.id,
        winningOutcome,
        goalCountInWindow: opts.goalCountInWindow ?? 0,
        evidenceUri: opts.evidenceUri ?? "",
        challengeDeadline,
        status,
        txHash: deterministicTxHash(`proposal:${commercial.id}:${status}`),
      };
      this.state.proposals.push(proposal);
    } else {
      proposal.winningOutcome = winningOutcome;
      proposal.goalCountInWindow = opts.goalCountInWindow ?? proposal.goalCountInWindow;
      proposal.evidenceUri = opts.evidenceUri ?? proposal.evidenceUri;
      proposal.challengeDeadline = challengeDeadline;
      proposal.status = status;
    }
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

  // Demo-only: inject a Trade record for a commercial market id so the /portfolio
  // page has positions to display even when no event indexer has run. Synthesizes
  // the supporting Market + LiveWindow rows (like seedDemoSettlementForCommercial)
  // and optionally overrides the market status so the position lands in a specific
  // bucket (live / awaiting / redeemable / voided / settled).
  seedDemoPositionForCommercial(opts: {
    commercialMarketId: string;
    walletAddress: `0x${string}`;
    outcomeIndex: number;
    collateralAmountRaw: string;
    sharesAmountRaw?: string;
    tradeType?: "buy" | "sell";
    marketStatusOverride?: Market["status"];
    oracleStateOverride?: Market["oracleState"];
  }): Trade {
    const commercial = this.state.commercialMarkets.find((candidate) => candidate.id === opts.commercialMarketId);
    if (!commercial) throw Object.assign(new Error("Commercial market not found"), { code: "COMMERCIAL_MARKET_NOT_FOUND" });
    const fixture = this.state.fixtures.find((candidate) => candidate.id === commercial.fixtureId);
    if (!fixture) throw Object.assign(new Error("Fixture not found"), { code: "FIXTURE_NOT_FOUND" });
    const outcomeIndex = Math.max(0, Math.min(commercial.outcomes.length - 1, opts.outcomeIndex));
    const tradeType = opts.tradeType ?? "buy";
    const sharesAmountRaw = opts.sharesAmountRaw ?? opts.collateralAmountRaw;

    let liveWindow = this.state.liveWindows.find((candidate) => candidate.windowKey === commercial.windowKey);
    if (!liveWindow) {
      liveWindow = {
        id: `${commercial.id}:window`,
        fixtureId: fixture.id,
        windowKey: commercial.windowKey,
        windowType: "goal_in_next_10_minutes",
        startMatchSecond: commercial.startMatchSecond,
        endMatchSecond: commercial.endMatchSecond,
        tradingCloseMatchSecond: commercial.tradingCloseMatchSecond,
        title: commercial.title,
        status: "closed",
        dataQualityStatus: fixture.dataQualityStatus,
      };
      this.state.liveWindows.push(liveWindow);
    }

    const deployment = getXLayerMarketDeployment(commercial.windowKey);
    let market = this.state.markets.find((candidate) => candidate.id === commercial.id);
    if (!market) {
      market = {
        id: commercial.id,
        liveWindowId: liveWindow.id,
        marketKey: commercial.windowKey,
        title: commercial.title,
        status: opts.marketStatusOverride ?? "live_trading",
        fixture,
        liveWindow: { ...liveWindow, marketId: commercial.id },
        outcomes: commercial.outcomes.map((outcome) => ({ outcomeIndex: outcome.outcomeIndex, label: outcome.label, probabilityBps: outcome.probabilityBps })),
        marketAddress: deployment?.marketAddress,
        txHash: deployment?.txHash,
        volumeRaw: "0",
        liquidityRaw: "0",
        oracleState: opts.oracleStateOverride ?? "none",
        dataQualityStatus: fixture.dataQualityStatus,
      };
      liveWindow.marketId = market.id;
      this.state.markets.push(market);
    } else {
      if (opts.marketStatusOverride) market.status = opts.marketStatusOverride;
      if (opts.oracleStateOverride) market.oracleState = opts.oracleStateOverride;
      if (!market.marketAddress && deployment?.marketAddress) market.marketAddress = deployment.marketAddress;
      if (!market.txHash && deployment?.txHash) market.txHash = deployment.txHash;
    }

    return this.recordTrade({
      marketId: market.id,
      walletAddress: opts.walletAddress,
      outcomeIndex,
      collateralAmountRaw: opts.collateralAmountRaw,
      sharesAmountRaw,
      tradeType,
    });
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
    const definition = input.marketType === "match_winner"
      ? buildMatchWinnerMarketDefinition({ fixtureId: fixture.id, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam })
      : input.marketType === "exact_score"
        ? buildExactScoreMarketDefinition({ fixtureId: fixture.id, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam })
        : undefined;
    if (!definition) throw Object.assign(new Error(`Unsupported commercial market type: ${input.marketType}`), { code: "UNSUPPORTED_COMMERCIAL_MARKET_TYPE" });
    this.state.commercialMarkets.push(definition);
    return definition;
  }

  listCommercialMarkets(filters: { fixtureId?: string; marketType?: CommercialMarketType } = {}): CommercialMarketDefinition[] {
    return this.state.commercialMarkets.filter((market) => {
      if (filters.fixtureId && market.fixtureId !== filters.fixtureId) return false;
      if (filters.marketType && market.marketType !== filters.marketType) return false;
      return true;
    });
  }

  getCommercialMarketById(id: string): CommercialMarketDefinition | undefined {
    return this.state.commercialMarkets.find((market) => market.id === id);
  }

  bootstrapScheduleMarkets(): {
    fixturesCount: number;
    matchWinnerCreated: number;
    exactScoreCreated: number;
    matchWinnerExisting: number;
    exactScoreExisting: number;
    totalPools: number;
  } {
    const counters = { fixturesCount: 0, matchWinnerCreated: 0, exactScoreCreated: 0, matchWinnerExisting: 0, exactScoreExisting: 0, totalPools: 0 };
    for (const fixture of this.state.fixtures) {
      counters.fixturesCount += 1;
      for (const marketType of ["match_winner", "exact_score"] as const) {
        const before = this.state.commercialMarkets.length;
        this.createCommercialLiveWindow({ fixtureId: fixture.id, marketType, startMatchSecond: 0 });
        const created = this.state.commercialMarkets.length > before;
        if (marketType === "match_winner") {
          if (created) counters.matchWinnerCreated += 1;
          else counters.matchWinnerExisting += 1;
        } else {
          if (created) counters.exactScoreCreated += 1;
          else counters.exactScoreExisting += 1;
        }
      }
    }
    counters.totalPools = this.state.commercialMarkets.length;
    return counters;
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

/**
 * Build a deterministic, realistic match-event timeline for a fixture so the "Live feed"
 * panel always has something to render. Same fixture → same timeline.
 */
function synthesizeFixtureEvents(fixture: Fixture): MatchEvent[] {
  const hash = createHash("sha256").update(`feed:${fixture.id}`).digest();
  const rng = (idx: number, mod: number) => hash.readUInt8(idx % hash.length) % mod;
  const homeGoals = rng(0, 4); // 0..3
  const awayGoals = rng(1, 4);
  const cancelledGoal = rng(2, 5) === 0;

  const events: MatchEvent[] = [];
  const push = (minute: number, partial: Pick<MatchEvent, "eventType" | "team" | "isCancelled" | "isConfirmed">, idx: number) => {
    events.push({
      id: `event:${fixture.id}:${idx}:${partial.eventType}`,
      fixtureId: fixture.id,
      providerEventId: `seed:${fixture.id}:${idx}`,
      eventType: partial.eventType,
      team: partial.team,
      matchMinute: minute,
      matchSecond: minute * 60,
      isConfirmed: partial.isConfirmed,
      isCancelled: partial.isCancelled,
      source: "sports_data_provider",
    });
  };

  let idx = 0;
  push(1, { eventType: "half_start", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);

  // First-half goals: roughly half of goals before half-time
  const firstHalfHome = Math.ceil(homeGoals / 2);
  const firstHalfAway = Math.ceil(awayGoals / 2);
  for (let i = 0; i < firstHalfHome; i++) {
    const minute = 8 + rng(10 + i, 30); // 8..37
    push(minute, { eventType: "goal", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);
  }
  for (let i = 0; i < firstHalfAway; i++) {
    const minute = 12 + rng(20 + i, 30); // 12..41
    push(minute, { eventType: "goal", team: fixture.awayTeam, isCancelled: false, isConfirmed: true }, idx++);
  }
  push(45, { eventType: "half_end", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);

  push(46, { eventType: "half_start", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);
  // Optional VAR moment
  if (rng(3, 3) === 0) {
    push(55 + rng(4, 20), { eventType: "var_review", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);
  }
  if (cancelledGoal) {
    push(58 + rng(5, 10), { eventType: "goal_cancelled", team: fixture.awayTeam, isCancelled: true, isConfirmed: true }, idx++);
  }
  // Second-half goals
  const secondHalfHome = homeGoals - firstHalfHome;
  const secondHalfAway = awayGoals - firstHalfAway;
  for (let i = 0; i < secondHalfHome; i++) {
    const minute = 55 + rng(30 + i, 30); // 55..84
    push(minute, { eventType: "goal", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);
  }
  for (let i = 0; i < secondHalfAway; i++) {
    const minute = 58 + rng(40 + i, 28); // 58..85
    push(minute, { eventType: "goal", team: fixture.awayTeam, isCancelled: false, isConfirmed: true }, idx++);
  }

  push(90, { eventType: "full_time", team: fixture.homeTeam, isCancelled: false, isConfirmed: true }, idx++);

  return events.sort((a, b) => a.matchSecond - b.matchSecond);
}
