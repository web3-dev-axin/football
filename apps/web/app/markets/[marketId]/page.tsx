import { DEMO_MARKET_ID, type Market, type ResultProposal } from "@worldcup/shared";
import { MarketDetail } from "../../../components/markets/MarketDetail";
import { SettlementPanel } from "../../../components/settlement/SettlementPanel";
import { createDemoDbWithMarket } from "../../../lib/demo-data";
import { apiGet } from "../../../lib/api-client";

export default async function MarketPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params;
  const { db, market: demoMarket } = createDemoDbWithMarket();
  let market: Market = demoMarket;
  let proposal = db.state.proposals.find((candidate) => candidate.marketId === market.id);
  try {
    market = (await apiGet<{ market: Market }>(`/markets/${encodeURIComponent(marketId)}`)).market;
    const settlements = await apiGet<{ settlements: ResultProposal[] }>("/settlements");
    proposal = settlements.settlements.find((candidate) => candidate.marketId === market.id);
  } catch {
    market = marketId === DEMO_MARKET_ID ? demoMarket : { ...demoMarket, id: marketId, title: `Market ${marketId} not loaded from API` };
    proposal = db.state.proposals.find((candidate) => candidate.marketId === market.id);
  }
  return (
    <main className="stack">
      <MarketDetail market={market} />
      <SettlementPanel market={market} proposal={proposal} />
    </main>
  );
}
