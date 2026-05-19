import { describe, expect, test } from "bun:test";
import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";
import { demoMarketCreatedEvent, handleMarketCreated, handleRedeemed, handleResultFinalized, handleResultProposed, handleTradeExecuted } from "./event-handlers";

describe("indexer event handlers", () => {
  test("indexes market, trades, result, finalize, and redemption idempotently", () => {
    const db = new InMemoryDb();
    db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
    const market = handleMarketCreated(db, demoMarketCreatedEvent);
    const marketAgain = handleMarketCreated(db, demoMarketCreatedEvent);
    expect(marketAgain.id).toBe(market.id);
    expect(db.state.markets.length).toBe(1);

    const trade = handleTradeExecuted(db, { marketId: market.id, trader: "0x0000000000000000000000000000000000000aaa", outcomeIndex: 0, collateralAmount: "100000000", sharesAmount: "100000000", tradeType: "buy" });
    expect(trade.outcomeIndex).toBe(0);
    expect(db.getMarket(market.id)?.volumeRaw).toBe("100000000");

    const proposal = handleResultProposed(db, { marketId: market.id, winningOutcome: 0, goalCountInWindow: 1, evidenceUri: "demo://events", txHash: "0x000000000000000000000000000000000000000000000000000000000000beef" });
    expect(proposal.status).toBe("proposed");

    handleResultFinalized(db, { marketId: market.id, winningOutcome: 0 });
    expect(db.getMarket(market.id)?.oracleState).toBe("finalized");
    expect(db.state.proposals[0]?.status).toBe("finalized");

    const redemption = handleRedeemed(db, { marketId: market.id, user: "0x0000000000000000000000000000000000000aaa", outcomeIndex: 0, sharesBurned: "100000000", collateralPaid: "100000000" });
    expect(redemption.collateralPaidRaw).toBe("100000000");
  });

  test("indexes distinct market-created events without overwriting the demo market", () => {
    const db = new InMemoryDb();
    const first = handleMarketCreated(db, demoMarketCreatedEvent);
    const second = handleMarketCreated(db, {
      ...demoMarketCreatedEvent,
      marketId: "market-second",
      marketKey: "fixture:demo-2026-001:goal_window:4380:4980",
      marketAddress: "0x0000000000000000000000000000000000002002",
      windowStartMatchSecond: 4380,
      windowEndMatchSecond: 4980,
      txHash: "0x000000000000000000000000000000000000000000000000000000000000feed",
    });
    expect(first.id).toBe("market-demo-63-73");
    expect(second.id).toBe("market-second");
    expect(db.state.markets).toHaveLength(2);
    expect(db.getMarket("market-demo-63-73")?.marketAddress).toBe("0x0000000000000000000000000000000000001001");
    expect(db.getMarket("market-second")?.marketAddress).toBe("0x0000000000000000000000000000000000002002");
  });
});
