import type { InMemoryDb } from "@polygoal/db";
import { DEMO_FIXTURE, DEMO_LIVE_WINDOW, DEMO_MARKET_ID, DEMO_MARKET_KEY, DEMO_OUTCOMES, type OutcomeIndex } from "@polygoal/shared";

export type MarketCreatedEvent = {
  marketId: string;
  marketKey: string;
  marketAddress: `0x${string}`;
  conditionId: string;
  fixtureId: string;
  windowStartMatchSecond: number;
  windowEndMatchSecond: number;
  txHash: `0x${string}`;
};

export type TradeExecutedEvent = {
  marketId: string;
  trader: `0x${string}`;
  outcomeIndex: OutcomeIndex;
  collateralAmount: string;
  sharesAmount: string;
  tradeType: "buy" | "sell";
};

export type ResultProposedEvent = {
  marketId: string;
  winningOutcome: OutcomeIndex;
  goalCountInWindow: number;
  evidenceUri: string;
  txHash: `0x${string}`;
};

export type ResultFinalizedEvent = {
  marketId: string;
  winningOutcome: OutcomeIndex;
};


export type ConditionPreparedEvent = {
  marketId: string;
  conditionId: string;
  outcomeSlotCount: number;
};

export type PositionSplitEvent = {
  marketId: string;
  walletAddress: `0x${string}`;
  outcomeIndex: OutcomeIndex;
  collateralAmount: string;
  sharesAmount: string;
};

export type PositionMergedEvent = {
  marketId: string;
  walletAddress: `0x${string}`;
  outcomeIndex: OutcomeIndex;
  sharesAmount: string;
  collateralReturned: string;
};

export type ResultChallengedEvent = {
  resultProposalId: string;
  challengerAddress: `0x${string}`;
  reason: string;
  evidenceUri: string;
  bondAmountRaw: string;
};

export type MarketVoidedEvent = {
  marketId: string;
  reason: string;
};

export type IndexedBlockEvent = {
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  indexedAt: string;
};

export type RedeemedEvent = {
  marketId: string;
  user: `0x${string}`;
  outcomeIndex: OutcomeIndex;
  sharesBurned: string;
  collateralPaid: string;
};

export function handleMarketCreated(db: InMemoryDb, event: MarketCreatedEvent) {
  const existing = db.getMarket(event.marketId);
  if (existing) {
    existing.marketAddress = event.marketAddress;
    existing.txHash = event.txHash;
    return existing;
  }

  const liveWindow = db.state.liveWindows.find((window) => window.windowKey === event.marketKey) ?? {
    ...DEMO_LIVE_WINDOW,
    id: `live-window:${event.fixtureId}:${event.windowStartMatchSecond}:${event.windowEndMatchSecond}`,
    fixtureId: event.fixtureId,
    windowKey: event.marketKey,
    startMatchSecond: event.windowStartMatchSecond,
    endMatchSecond: event.windowEndMatchSecond,
    tradingCloseMatchSecond: Math.max(event.windowStartMatchSecond, event.windowEndMatchSecond - 30),
    title: `Indexed ${event.fixtureId} ${event.windowStartMatchSecond}-${event.windowEndMatchSecond}`,
    marketId: event.marketId,
  };
  if (!db.state.liveWindows.some((window) => window.windowKey === liveWindow.windowKey)) db.state.liveWindows.push(liveWindow);
  const fixture = db.getFixture(event.fixtureId) ?? DEMO_FIXTURE;

  const market = {
    id: event.marketId,
    liveWindowId: liveWindow.id,
    marketKey: event.marketKey,
    title: liveWindow.title,
    status: "live_trading" as const,
    fixture,
    liveWindow,
    outcomes: DEMO_OUTCOMES.map((outcome) => ({ ...outcome })),
    marketAddress: event.marketAddress,
    txHash: event.txHash,
    volumeRaw: "0",
    liquidityRaw: "0",
    oracleState: "none" as const,
    dataQualityStatus: "verified" as const,
  };
  db.state.markets.push(market);
  return market;
}

export function handleTradeExecuted(db: InMemoryDb, event: TradeExecutedEvent) {
  return db.recordTrade({
    marketId: event.marketId,
    walletAddress: event.trader,
    outcomeIndex: event.outcomeIndex,
    collateralAmountRaw: event.collateralAmount,
    sharesAmountRaw: event.sharesAmount,
    tradeType: event.tradeType,
  });
}

export function handleResultProposed(db: InMemoryDb, event: ResultProposedEvent) {
  const market = db.getMarket(event.marketId);
  if (!market) throw Object.assign(new Error("Market not found"), { code: "MARKET_NOT_FOUND" });
  market.status = "proposed";
  market.oracleState = "proposed";
  const proposal = {
    id: `proposal:${event.marketId}`,
    marketId: event.marketId,
    winningOutcome: event.winningOutcome,
    goalCountInWindow: event.goalCountInWindow,
    evidenceUri: event.evidenceUri,
    challengeDeadline: new Date(Date.now() + 600_000).toISOString(),
    status: "proposed" as const,
    txHash: event.txHash,
  };
  db.state.proposals.push(proposal);
  return proposal;
}

export function handleResultFinalized(db: InMemoryDb, event: ResultFinalizedEvent) {
  const market = db.getMarket(event.marketId);
  if (!market) throw Object.assign(new Error("Market not found"), { code: "MARKET_NOT_FOUND" });
  market.status = "redeemable";
  market.oracleState = "finalized";
  const proposal = db.state.proposals.find((candidate) => candidate.marketId === event.marketId);
  if (proposal) proposal.status = "finalized";
  return market;
}

export function handleRedeemed(db: InMemoryDb, event: RedeemedEvent) {
  return db.recordRedemption({
    marketId: event.marketId,
    walletAddress: event.user,
    outcomeIndex: event.outcomeIndex,
    sharesBurnedRaw: event.sharesBurned,
    collateralPaidRaw: event.collateralPaid,
  });
}


export function handleConditionPrepared(db: InMemoryDb, event: ConditionPreparedEvent) {
  const market = db.getMarket(event.marketId) ?? handleMarketCreated(db, { ...demoMarketCreatedEvent, marketId: event.marketId, marketKey: `indexed:${event.marketId}` });
  const metadata = { conditionId: event.conditionId, outcomeSlotCount: event.outcomeSlotCount };
  db.recordAudit("indexer", "condition.prepared", "market", market.id, metadata);
  return { marketId: market.id, metadata };
}

export function handlePositionSplit(db: InMemoryDb, event: PositionSplitEvent) {
  return db.recordTrade({
    marketId: event.marketId,
    walletAddress: event.walletAddress,
    outcomeIndex: event.outcomeIndex,
    collateralAmountRaw: event.collateralAmount,
    sharesAmountRaw: event.sharesAmount,
    tradeType: "buy",
  });
}

export function handlePositionMerged(db: InMemoryDb, event: PositionMergedEvent) {
  return db.recordTrade({
    marketId: event.marketId,
    walletAddress: event.walletAddress,
    outcomeIndex: event.outcomeIndex,
    collateralAmountRaw: event.collateralReturned,
    sharesAmountRaw: event.sharesAmount,
    tradeType: "sell",
  });
}

export function handleResultChallenged(db: InMemoryDb, event: ResultChallengedEvent) {
  return db.createChallenge(event);
}

export function handleMarketVoided(db: InMemoryDb, event: MarketVoidedEvent) {
  return db.voidMarketByOperator(event.marketId, "indexer", event.reason);
}

export function handleIndexedBlock(db: InMemoryDb, event: IndexedBlockEvent) {
  return db.recordIndexedBlock(event);
}

export const demoMarketCreatedEvent: MarketCreatedEvent = {
  marketId: DEMO_MARKET_ID,
  marketKey: DEMO_MARKET_KEY,
  marketAddress: "0x0000000000000000000000000000000000001001",
  conditionId: "0xcondition",
  fixtureId: DEMO_FIXTURE.id,
  windowStartMatchSecond: 3780,
  windowEndMatchSecond: 4380,
  txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
};
