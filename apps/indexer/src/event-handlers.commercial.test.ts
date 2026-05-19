import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import {
  demoMarketCreatedEvent,
  handleConditionPrepared,
  handleIndexedBlock,
  handleMarketCreated,
  handleMarketVoided,
  handlePositionMerged,
  handlePositionSplit,
  handleResultChallenged,
  handleResultProposed,
} from "./event-handlers";

describe("commercial indexer handlers", () => {
  test("indexes commercial chain events and blocks idempotently", () => {
    const db = new InMemoryDb();
    db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = handleMarketCreated(db, demoMarketCreatedEvent);
    const condition = handleConditionPrepared(db, { marketId: market.id, conditionId: "0xcondition", outcomeSlotCount: 2 });
    expect(condition.metadata.conditionId).toBe("0xcondition");

    const split = handlePositionSplit(db, { marketId: market.id, walletAddress: "0x0000000000000000000000000000000000000aaa", outcomeIndex: 0, collateralAmount: "1000000", sharesAmount: "1000000" });
    expect(split.sharesAmountRaw).toBe("1000000");
    const merged = handlePositionMerged(db, { marketId: market.id, walletAddress: "0x0000000000000000000000000000000000000aaa", outcomeIndex: 0, sharesAmount: "500000", collateralReturned: "500000" });
    expect(merged.tradeType).toBe("sell");

    const proposal = handleResultProposed(db, { marketId: market.id, winningOutcome: 0, goalCountInWindow: 1, evidenceUri: "demo://events", txHash: "0x000000000000000000000000000000000000000000000000000000000000beef" });
    const challenge = handleResultChallenged(db, { resultProposalId: proposal.id, challengerAddress: "0x0000000000000000000000000000000000000bbb", reason: "event mismatch", evidenceUri: "ipfs://challenge", bondAmountRaw: "100" });
    expect(challenge.status).toBe("open");
    expect(db.getMarket(market.id)?.oracleState).toBe("challenged");
    const voided = handleMarketVoided(db, { marketId: market.id, reason: "oracle void" });
    expect(voided.oracleState).toBe("voided");

    handleIndexedBlock(db, { chainId: 31337, blockNumber: 100n, blockHash: "0xabc", indexedAt: "2026-06-13T22:00:00.000Z" });
    handleIndexedBlock(db, { chainId: 31337, blockNumber: 100n, blockHash: "0xdef", indexedAt: "2026-06-13T22:01:00.000Z" });
    expect(db.state.indexedBlocks).toHaveLength(1);
    expect(db.state.indexedBlocks[0]?.blockHash).toBe("0xdef");
  });
});
