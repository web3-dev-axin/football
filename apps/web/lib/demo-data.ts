import { InMemoryDb } from "@polygoal/db";
import { DEMO_FIXTURE_ID } from "@polygoal/shared";

export function createDemoDbWithCommercialMarkets() {
  const db = new InMemoryDb();
  const liveWindow = db.createLiveWindow({ fixtureId: DEMO_FIXTURE_ID, startMatchSecond: 3780, endMatchSecond: 4380 });
  const market = db.createMarket(liveWindow.id);
  const commercialMarkets = [
    db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "match_winner", startMatchSecond: 0 }),
    db.createCommercialLiveWindow({ fixtureId: DEMO_FIXTURE_ID, marketType: "exact_score", startMatchSecond: 0 }),
  ];
  return { db, liveWindow, market, commercialMarkets };
}

export function createDemoDbWithSettlement() {
  const { db, liveWindow, market } = createDemoDbWithCommercialMarkets();
  db.syncDemoLiveEvents("demo_goal");
  db.compareLiveEvents(DEMO_FIXTURE_ID, 3780, 4380);
  const proposal = db.proposeResult(market.id, "demo://fixture/demo-2026-001/events");
  return { db, liveWindow, market: db.getMarket(market.id)!, proposal };
}
