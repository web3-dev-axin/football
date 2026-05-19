import type { Fixture } from "@worldcup/shared";
import { DataQualityBadge } from "../ui/DataQualityBadge";

export function LiveMatchCard({ fixture }: { fixture: Fixture }) {
  return (
    <section className="card stack">
      <DataQualityBadge status={fixture.dataQualityStatus} />
      <h2>{fixture.homeTeam} vs {fixture.awayTeam}</h2>
      <p className="kpi fixture-meta">
        <span>{fixture.displayClock}</span>
        <span>{fixture.homeScore}-{fixture.awayScore}</span>
        <span>{fixture.venue}</span>
      </p>
      <p>Live fixture is eligible for the 63:00-73:00 goal window demo market.</p>
    </section>
  );
}
