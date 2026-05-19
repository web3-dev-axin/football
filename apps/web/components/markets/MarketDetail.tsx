import type { Market } from "@worldcup/shared";
import type { OddsComparison } from "@worldcup/odds-ingestion";
import { DataQualityBadge } from "../ui/DataQualityBadge";
import { OddsDeviationBadge } from "./OddsDeviationBadge";
import { SellPanel } from "./SellPanel";
import { TradeForm } from "./TradeForm";

export function MarketDetail({ market }: { market: Market & { oddsComparison?: OddsComparison } }) {
  return (
    <div className="two-col trade-layout">
      <section className="card stack">
        <DataQualityBadge status={market.dataQualityStatus} />
        <h1>{market.title}</h1>
        <p className="kpi fixture-meta">
          <span>{market.fixture.homeTeam} vs {market.fixture.awayTeam}</span>
          <span>{market.fixture.displayClock}</span>
          <span>score {market.fixture.homeScore}-{market.fixture.awayScore}</span>
        </p>
        <div className="grid">
          {market.outcomes.map((outcome) => (
            <div className="card" key={outcome.outcomeIndex}>
              <strong>{outcome.label}</strong>
              <p className="kpi">Probability {(outcome.probabilityBps / 100).toFixed(0)}%</p>
            </div>
          ))}
        </div>
        <h2>Settlement rule</h2>
        <p>Yes wins if either team scores a confirmed, non-cancelled goal in the 63:00-73:00 window. VAR-cancelled goals do not count.</p>
        <OddsDeviationBadge status={market.oddsComparison?.status ?? "verified"} maxDeviationBps={market.oddsComparison?.maxDeviationBps ?? 120} />
        <p className="kpi">Oracle state: {market.oracleState}</p>
      </section>
      <section className="stack trade-panels">
        <TradeForm market={market} wallet={{ connected: false, chainId: 31337 }} />
        <SellPanel market={market} wallet={{ connected: false, chainId: 31337 }} />
      </section>
    </div>
  );
}
