import { InMemoryDb } from "@worldcup/db";
import { DEMO_FIXTURE_ID } from "@worldcup/shared";

export function createDemoDbWithMarket() {
  const db = new InMemoryDb();
  const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
  const market = db.createMarket(liveWindow.id);
  return { db, liveWindow, market };
}

export function createDemoDbWithSettlement() {
  const { db, liveWindow, market } = createDemoDbWithMarket();
  db.syncDemoLiveEvents("demo_goal");
  db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
  const proposal = db.proposeResult(market.id, "demo://fixture/demo-2026-001/events");
  db.finalizeResult(market.id);
  return { db, market: db.getMarket(market.id)!, proposal };
}


export function createDemoDbWithCommercialMarkets() {
  const { db, liveWindow, market } = createDemoDbWithMarket();
  const commercialMarkets = [
    db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_5m", startMatchSecond: 3780 }),
    db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_10m", startMatchSecond: 3780 }),
    db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "goal_window_15m", startMatchSecond: 3780 }),
    db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "next_goal_team", startMatchSecond: 3780, endMatchSecond: 5400 }),
  ];
  return { db, liveWindow, market, commercialMarkets };
}
