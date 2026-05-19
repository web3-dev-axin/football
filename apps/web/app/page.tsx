import { LiveMatchCard } from "../components/live/LiveMatchCard";
import { LiveWindowCard } from "../components/markets/LiveWindowCard";
import { MarketMatrixPanel } from "../components/markets/MarketMatrixPanel";
import { createDemoDbWithCommercialMarkets } from "../lib/demo-data";

export default function HomePage() {
  const { market, liveWindow, commercialMarkets } = createDemoDbWithCommercialMarkets();
  return (
    <main className="stack">
      <section className="card">
        <h1>2026 World Cup Live Goal Window</h1>
        <p>Testnet MVP for short-cycle Yes/No markets. Mock USDC has no real value and displayed probabilities are not real odds.</p>
      </section>
      <div className="grid">
        <LiveMatchCard fixture={market.fixture} />
        <LiveWindowCard liveWindow={liveWindow} market={market} />
      </div>
      <MarketMatrixPanel markets={commercialMarkets} />
    </main>
  );
}
