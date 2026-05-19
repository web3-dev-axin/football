import { LiveWindowCard } from "../../components/markets/LiveWindowCard";
import { MarketMatrixPanel } from "../../components/markets/MarketMatrixPanel";
import { createDemoDbWithCommercialMarkets } from "../../lib/demo-data";

export default function LivePage() {
  const { market, liveWindow, commercialMarkets } = createDemoDbWithCommercialMarkets();
  return (
    <main className="stack">
      <h1>Live Markets</h1>
      <LiveWindowCard liveWindow={liveWindow} market={market} />
      <MarketMatrixPanel markets={commercialMarkets} />
    </main>
  );
}
