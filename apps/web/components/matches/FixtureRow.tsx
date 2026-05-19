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
  const countdown = !isLive && !isFinal ? humanCountdown(kickoff.getTime() - Date.now()) : null;

  return (
    <Card variant="default" className={`fixture-card${isLive ? " is-live" : ""}${isFinal ? " is-final" : ""}`}>
      <header className="fixture-card-top">
        <span className="fixture-card-eyebrow">
          <span className="fixture-card-match-no">Match {fixture.matchNumber}</span>
          {countdown ? <span className="fixture-card-countdown">in {countdown}</span> : null}
        </span>
        {isLive ? (
          <span className="fixture-card-status live">
            <span className="fixture-card-status-dot" aria-hidden />
            Live · {fixture.displayClock}
          </span>
        ) : isFinal ? (
          <span className="fixture-card-status final">Full time</span>
        ) : (
          <span className="fixture-card-status scheduled">
            <strong>{kickoffTime}</strong>
            <small>{kickoffDate}</small>
          </span>
        )}
      </header>

      <Link className="fixture-card-board" href={fixtureMarketHref} aria-label={`Open ${fixture.homeTeam} vs ${fixture.awayTeam}`} prefetch={false}>
        <div className="fixture-card-team">
          <span className="fixture-card-flag" aria-hidden>{home.flag}</span>
          <span className="fixture-card-team-name">{fixture.homeTeam}</span>
          <span className="fixture-card-team-code">{home.code}</span>
        </div>

        <div className="fixture-card-center">
          {isLive || isFinal ? (
            <div className="fixture-card-score">
              <span>{fixture.homeScore}</span>
              <span className="fixture-card-score-sep">:</span>
              <span>{fixture.awayScore}</span>
            </div>
          ) : (
            <span className="fixture-card-vs">VS</span>
          )}
        </div>

        <div className="fixture-card-team away">
          <span className="fixture-card-flag" aria-hidden>{away.flag}</span>
          <span className="fixture-card-team-name">{fixture.awayTeam}</span>
          <span className="fixture-card-team-code">{away.code}</span>
        </div>
      </Link>

      <div className="fixture-card-meta">
        <span className="fixture-card-meta-item">
          <span className="fixture-card-meta-icon" aria-hidden>📍</span>
          {fixture.venue}
        </span>
      </div>

      <footer className="fixture-card-actions">
        {hasMatchWinner ? (
          <Link className="fixture-card-action primary" href={fixtureMarketHref} prefetch={false}>
            <span className="fixture-card-action-label">Match winner</span>
            <span className="fixture-card-action-meta">3 outcomes</span>
            <span className="fixture-card-action-arrow" aria-hidden>→</span>
          </Link>
        ) : null}
        {hasExactScore ? (
          <Link className="fixture-card-action" href={exactScoreHref} prefetch={false}>
            <span className="fixture-card-action-label">Exact score</span>
            <span className="fixture-card-action-meta">10 outcomes</span>
            <span className="fixture-card-action-arrow" aria-hidden>→</span>
          </Link>
        ) : null}
        {!hasMatchWinner && !hasExactScore ? (
          <span className="fixture-card-pending">Markets open at kickoff</span>
        ) : null}
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
