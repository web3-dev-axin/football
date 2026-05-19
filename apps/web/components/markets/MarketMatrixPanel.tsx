import type { CommercialMarketDefinition } from "@worldcup/shared";

function matrixLabel(marketType: CommercialMarketDefinition["marketType"]): string {
  if (marketType === "goal_window_5m") return "5-minute goal window";
  if (marketType === "goal_window_10m") return "10-minute goal window";
  if (marketType === "goal_window_15m") return "15-minute goal window";
  if (marketType === "next_goal_team") return "Next goal team";
  return marketType.replaceAll("_", " ");
}

export function MarketMatrixPanel({ markets }: { markets: CommercialMarketDefinition[] }) {
  return (
    <section className="card stack">
      <div>
        <span className="badge">Commercial market matrix</span>
        <h2>Live Market Matrix</h2>
        <p className="kpi">Goal windows are binary and chain-ready. Multi-outcome markets remain metadata-only until contract support is enabled.</p>
      </div>
      <div className="grid matrix-grid">
        {markets.map((market) => (
          <article className="matrix-card" key={market.id}>
            <strong>{matrixLabel(market.marketType)}</strong>
            <p className="kpi fixture-meta">
              <span>{market.startMatchSecond}s</span>
              <span>{market.endMatchSecond}s</span>
            </p>
            <p>{market.outcomes.map((outcome) => outcome.label).join(" / ")}</p>
            <span className={market.chainCreationEnabled ? "badge" : "badge warn"}>{market.chainCreationEnabled ? "Chain ready" : "Chain creation gated"}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
