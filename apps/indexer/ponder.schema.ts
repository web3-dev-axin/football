import { onchainTable, primaryKey, index } from "ponder";

/**
 * One row per `WorldCupMarket` clone the factory ever deployed. Acts as the
 * lookup table from `marketAddress` (used by per-market events) back to the
 * stable `marketId` bytes32 and the human `marketKey` (`fixture:<id>:<type>`).
 */
export const market = onchainTable("market", (t) => ({
  marketId: t.hex().primaryKey(),
  marketAddress: t.hex().notNull(),
  marketKey: t.text().notNull(),
  fixtureId: t.text().notNull(),
  windowStartMatchSecond: t.bigint().notNull(),
  windowEndMatchSecond: t.bigint().notNull(),
  conditionId: t.hex().notNull(),
  outcomeCount: t.integer().notNull(),
  createdBlock: t.bigint().notNull(),
  createdTxHash: t.hex().notNull(),
  createdAt: t.bigint().notNull(),
}), (t) => ({
  marketAddressIdx: index().on(t.marketAddress),
  fixtureIdx: index().on(t.fixtureId),
}));

/**
 * Every `TradeExecuted` (buy or sell) emitted by any `WorldCupMarket`.
 * `tradeType` is 0=buy, 1=sell from the contract enum.
 */
export const trade = onchainTable("trade", (t) => ({
  id: t.text().primaryKey(),
  marketId: t.hex().notNull(),
  marketAddress: t.hex().notNull(),
  trader: t.hex().notNull(),
  outcomeIndex: t.integer().notNull(),
  collateralAmountRaw: t.bigint().notNull(),
  sharesAmountRaw: t.bigint().notNull(),
  tradeType: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
}), (t) => ({
  traderIdx: index().on(t.trader),
  marketIdx: index().on(t.marketId),
  marketTraderIdx: index().on(t.marketAddress, t.trader),
}));

/**
 * Each `Redeemed` payout claimed by a user against a settled market.
 */
export const redemption = onchainTable("redemption", (t) => ({
  id: t.text().primaryKey(),
  marketId: t.hex().notNull(),
  marketAddress: t.hex().notNull(),
  user: t.hex().notNull(),
  outcomeIndex: t.integer().notNull(),
  sharesBurnedRaw: t.bigint().notNull(),
  collateralPaidRaw: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  blockTimestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  logIndex: t.integer().notNull(),
}), (t) => ({
  userIdx: index().on(t.user),
  marketIdx: index().on(t.marketId),
}));

/**
 * Aggregated lifecycle row per `marketId`. Updated by `ResultProposed`,
 * `ResultChallenged`, `ResultFinalized`, `MarketVoided` events (whichever the
 * oracle emits last wins; status reflects the most recent transition).
 */
export const resultProposal = onchainTable("result_proposal", (t) => ({
  marketId: t.hex().primaryKey(),
  marketAddress: t.hex(),
  proposalId: t.hex(),
  proposer: t.hex(),
  winningOutcome: t.integer().notNull(),
  payloadHash: t.hex(),
  challengeDeadline: t.bigint(),
  status: t.text().notNull(),
  challengeReason: t.text(),
  challengeEvidenceUri: t.text(),
  challenger: t.hex(),
  payoutDenominator: t.bigint(),
  proposedBlock: t.bigint(),
  proposedTxHash: t.hex(),
  finalizedBlock: t.bigint(),
  finalizedTxHash: t.hex(),
}));

/**
 * Aggregated per-(market, trader, outcomeIndex) position derived from `trade`.
 * Net shares = SUM(buy.shares) - SUM(sell.shares). Useful so the API doesn't
 * have to re-aggregate trades on every `/portfolio/:wallet` request.
 */
export const position = onchainTable("position", (t) => ({
  marketId: t.hex().notNull(),
  marketAddress: t.hex().notNull(),
  trader: t.hex().notNull(),
  outcomeIndex: t.integer().notNull(),
  sharesRaw: t.bigint().notNull(),
  collateralInRaw: t.bigint().notNull(),
  collateralOutRaw: t.bigint().notNull(),
  redeemedRaw: t.bigint().notNull(),
  lastUpdatedBlock: t.bigint().notNull(),
}), (t) => ({
  pk: primaryKey({ columns: [t.marketAddress, t.trader, t.outcomeIndex] }),
  traderIdx: index().on(t.trader),
}));
