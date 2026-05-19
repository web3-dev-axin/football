import { ponder } from "ponder:registry";
import schema from "ponder:schema";

const { market, trade, redemption, resultProposal, position } = schema;

ponder.on("WorldCupMarketFactory:MarketCreated", async ({ event, context }) => {
  await context.db.insert(market).values({
    marketId: event.args.marketId,
    marketAddress: event.args.market,
    marketKey: event.args.marketKey,
    fixtureId: event.args.fixtureId,
    windowStartMatchSecond: event.args.windowStartMatchSecond,
    windowEndMatchSecond: event.args.windowEndMatchSecond,
    conditionId: event.args.conditionId,
    outcomeCount: Number(event.args.outcomeCount),
    createdBlock: event.block.number,
    createdTxHash: event.transaction.hash,
    createdAt: event.block.timestamp,
  });
});

ponder.on("WorldCupMarket:TradeExecuted", async ({ event, context }) => {
  const tradeId = `${event.transaction.hash}:${event.log.logIndex}`;
  const marketId = event.args.marketId;
  const marketAddress = event.log.address;
  const outcomeIndex = Number(event.args.outcomeIndex);
  const tradeType = Number(event.args.tradeType);

  await context.db.insert(trade).values({
    id: tradeId,
    marketId,
    marketAddress,
    trader: event.args.trader,
    outcomeIndex,
    collateralAmountRaw: event.args.collateralAmount,
    sharesAmountRaw: event.args.sharesAmount,
    tradeType,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });

  const isBuy = tradeType === 0;
  const sharesDelta = isBuy ? event.args.sharesAmount : -event.args.sharesAmount;
  const collateralIn = isBuy ? event.args.collateralAmount : 0n;
  const collateralOut = isBuy ? 0n : event.args.collateralAmount;

  await context.db
    .insert(position)
    .values({
      marketId,
      marketAddress,
      trader: event.args.trader,
      outcomeIndex,
      sharesRaw: sharesDelta,
      collateralInRaw: collateralIn,
      collateralOutRaw: collateralOut,
      redeemedRaw: 0n,
      lastUpdatedBlock: event.block.number,
    })
    .onConflictDoUpdate((current) => ({
      sharesRaw: current.sharesRaw + sharesDelta,
      collateralInRaw: current.collateralInRaw + collateralIn,
      collateralOutRaw: current.collateralOutRaw + collateralOut,
      lastUpdatedBlock: event.block.number,
    }));
});

ponder.on("WorldCupMarket:Redeemed", async ({ event, context }) => {
  const redemptionId = `${event.transaction.hash}:${event.log.logIndex}`;
  const marketAddress = event.log.address;
  const outcomeIndex = Number(event.args.outcomeIndex);

  await context.db.insert(redemption).values({
    id: redemptionId,
    marketId: event.args.marketId,
    marketAddress,
    user: event.args.user,
    outcomeIndex,
    sharesBurnedRaw: event.args.sharesBurned,
    collateralPaidRaw: event.args.collateralPaid,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });

  await context.db
    .update(position, {
      marketAddress,
      trader: event.args.user,
      outcomeIndex,
    })
    .set((current) => ({
      sharesRaw: current.sharesRaw - event.args.sharesBurned,
      redeemedRaw: current.redeemedRaw + event.args.collateralPaid,
      lastUpdatedBlock: event.block.number,
    }));
});

ponder.on("OptimisticResultOracle:ResultProposed", async ({ event, context }) => {
  await context.db
    .insert(resultProposal)
    .values({
      marketId: event.args.marketId,
      marketAddress: event.args.proposalId,
      proposalId: event.args.proposalId,
      proposer: event.args.proposer,
      winningOutcome: Number(event.args.winningOutcome),
      payloadHash: event.args.payloadHash,
      challengeDeadline: event.args.challengeDeadline,
      status: "proposed",
      proposedBlock: event.block.number,
      proposedTxHash: event.transaction.hash,
    })
    .onConflictDoUpdate(() => ({
      proposalId: event.args.proposalId,
      proposer: event.args.proposer,
      winningOutcome: Number(event.args.winningOutcome),
      payloadHash: event.args.payloadHash,
      challengeDeadline: event.args.challengeDeadline,
      status: "proposed",
      proposedBlock: event.block.number,
      proposedTxHash: event.transaction.hash,
    }));
});

ponder.on("OptimisticResultOracle:ResultChallenged", async ({ event, context }) => {
  await context.db
    .insert(resultProposal)
    .values({
      marketId: event.args.marketId,
      winningOutcome: 0,
      status: "challenged",
      challenger: event.args.challenger,
      challengeReason: event.args.reason,
      challengeEvidenceUri: event.args.evidenceUri,
    })
    .onConflictDoUpdate(() => ({
      status: "challenged",
      challenger: event.args.challenger,
      challengeReason: event.args.reason,
      challengeEvidenceUri: event.args.evidenceUri,
    }));
});

ponder.on("OptimisticResultOracle:ResultFinalized", async ({ event, context }) => {
  await context.db
    .insert(resultProposal)
    .values({
      marketId: event.args.marketId,
      winningOutcome: Number(event.args.winningOutcome),
      payoutDenominator: event.args.payoutDenominator,
      status: "finalized",
      finalizedBlock: event.block.number,
      finalizedTxHash: event.transaction.hash,
    })
    .onConflictDoUpdate(() => ({
      winningOutcome: Number(event.args.winningOutcome),
      payoutDenominator: event.args.payoutDenominator,
      status: "finalized",
      finalizedBlock: event.block.number,
      finalizedTxHash: event.transaction.hash,
    }));
});

ponder.on("OptimisticResultOracle:MarketVoided", async ({ event, context }) => {
  await context.db
    .insert(resultProposal)
    .values({
      marketId: event.args.marketId,
      marketAddress: event.args.market,
      winningOutcome: 0,
      status: "voided",
      finalizedBlock: event.block.number,
      finalizedTxHash: event.transaction.hash,
    })
    .onConflictDoUpdate(() => ({
      status: "voided",
      finalizedBlock: event.block.number,
      finalizedTxHash: event.transaction.hash,
    }));
});
