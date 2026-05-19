import { InMemoryDb } from "@polygoal/db";
import { demoMarketCreatedEvent, handleMarketCreated } from "./event-handlers";

const db = new InMemoryDb();
const market = handleMarketCreated(db, demoMarketCreatedEvent);
console.log(JSON.stringify({ ok: true, indexedMarket: market.id, marketAddress: market.marketAddress }, null, 2));
