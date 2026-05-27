import Link from "next/link";
import type { Fixture } from "@polygoal/shared";
import { Card } from "@heroui/react";
import { marketHref } from "../../lib/market-copy";
import { teamMeta } from "../../lib/teams";

type Props = {
  fixture: Fixture;
  hasMatchWinner?: boolean;
  hasExactScore?: boolean;
};

export function FixtureRow({ fixture, hasMatchWinner = false, hasExactScore = false }: Props) {
  const isLive = fixture.status === "live";
  const isFinal = fixture.status === "full_time" || fixture.status === "final";
  const fixtureMarketHref = marketHref(`${fixture.id}:match_winner`);
  const exactScoreHref = `${fixtureMarketHref}?market=exact_score`;

  const home = teamMeta(fixture.homeTeam);
  const away = teamMeta(fixture.awayTeam);
  const kickoff = new Date(fixture.kickoffAtUtc);
  const kickoffTime = kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const kickoffDate = kickoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <Card variant="default" className={`fixture-card${isLive ? " is-live" : ""}${isFinal ? " is-final" : ""}`}>
      <header className="market-card-header">
        <div>
          <span className="market-code">Match {fixture.matchNumber}</span>
          <h3>{fixture.homeTeam} vs {fixture.awayTeam}</h3>
        </div>
        <button className="watch-button" type="button">Watch</button>
      </header>

      <Link 
        className="fixture-line" 
        href={fixtureMarketHref} 
        style={{ "--home-share": "33%", "--draw-share": "34%" } as React.CSSProperties}
        prefetch={false}
      >
        <span className="flag-icon">{home.flag}</span>
        <span className="versus">
          {isLive || isFinal ? `${fixture.homeScore} : ${fixture.awayScore}` : kickoffDate}
        </span>
        <span className="flag-icon">{away.flag}</span>
      </Link>

      <div className="market-meta">
        <span>{isLive ? `Live ${fixture.displayClock}` : kickoffTime}</span>
        <span>{fixture.venue}</span>
      </div>

      {hasMatchWinner ? (
        <div className="probability-list">
          <Link href={fixtureMarketHref} className="probability-button yes" prefetch={false}>
            <span>{home.code}</span>
            <strong>33c</strong>
          </Link>
          <Link href={fixtureMarketHref} className="probability-button neutral" prefetch={false}>
            <span>Draw</span>
            <strong>34c</strong>
          </Link>
          <Link href={fixtureMarketHref} className="probability-button no" prefetch={false}>
            <span>{away.code}</span>
            <strong>33c</strong>
          </Link>
        </div>
      ) : (
        <div className="probability-list">
          <span className="fixture-card-pending">Markets open at kickoff</span>
        </div>
      )}

      <footer className="market-card-footer">
        {hasMatchWinner ? <Link href={fixtureMarketHref} prefetch={false}>Match winner</Link> : null}
        {hasExactScore ? <Link href={exactScoreHref} prefetch={false}>Exact score</Link> : null}
        {!hasMatchWinner && !hasExactScore ? <span>Coming soon</span> : null}
      </footer>
    </Card>
  );
}

function humanCountdown(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
