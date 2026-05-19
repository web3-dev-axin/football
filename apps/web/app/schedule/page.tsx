import { LiveMatchCard } from "../../components/live/LiveMatchCard";
import { createDemoDbWithCommercialMarkets } from "../../lib/demo-data";

export default function SchedulePage() {
  const { market } = createDemoDbWithCommercialMarkets();
  return (
    <main className="stack">
      <section className="card stack">
        <span className="badge">Schedule</span>
        <h1>World Cup Schedule</h1>
        <p className="kpi">Discover qualified teams, kickoff times, venue context, and live market readiness before entering a trading window.</p>
      </section>
      <LiveMatchCard fixture={market.fixture} />
      <section className="card stack">
        <h2>{market.fixture.homeTeam} vs {market.fixture.awayTeam}</h2>
        <p>Kickoff: {market.fixture.kickoffAtUtc}</p>
        <p>Venue: {market.fixture.venue}</p>
        <a className="button" href="/live">Open live markets</a>
      </section>
    </main>
  );
}
