"use client";

import Link from "next/link";
import type { Fixture } from "@polygoal/shared";

interface FeaturedMarketProps {
  fixture: Fixture;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  liquidity?: string;
}

export function FeaturedMarket({
  fixture,
  homeOdds = 33,
  drawOdds = 34,
  awayOdds = 33,
  liquidity = "$0",
}: FeaturedMarketProps) {
  const isLive = fixture.status === "live";
  const displayClock = fixture.displayClock || "0:00";

  return (
    <article className="featured-market">
      <div className="featured-topline">
        {isLive ? (
          <span className="live-pill">
            <span></span> Live {displayClock}
          </span>
        ) : (
          <span className="market-code">Match {fixture.matchNumber}</span>
        )}
        <span className="liquidity">{liquidity} Liquidity</span>
      </div>

      <div
        className="score-strip"
        style={{
          "--home-share": `${homeOdds}%`,
          "--draw-share": `${drawOdds}%`,
        } as React.CSSProperties}
      >
        <div className="team-block">
          <span className="flag-icon">🏳️</span>
          <strong>{fixture.homeTeam}</strong>
          <small>Match {fixture.matchNumber}</small>
        </div>
        <div className="score-clock">
          {isLive || fixture.status === "final" ? (
            <strong>
              {fixture.homeScore ?? 0} : {fixture.awayScore ?? 0}
            </strong>
          ) : (
            <strong>vs</strong>
          )}
          <span>{fixture.venue || "TBD"}</span>
        </div>
        <div className="team-block align-right">
          <span className="flag-icon">🏳️</span>
          <strong>{fixture.awayTeam}</strong>
          <small>Match {fixture.matchNumber}</small>
        </div>
      </div>

      <div className="odds-stack">
        <button
          className={`odds-row ${homeOdds > drawOdds && homeOdds > awayOdds ? "is-leading" : ""}`}
          type="button"
        >
          <span>{fixture.homeTeam} wins</span>
          <span className="bar" style={{ "--value": `${homeOdds}%` } as React.CSSProperties}></span>
          <strong>{homeOdds}%</strong>
        </button>
        <button className="odds-row" type="button">
          <span>Draw</span>
          <span className="bar" style={{ "--value": `${drawOdds}%` } as React.CSSProperties}></span>
          <strong>{drawOdds}%</strong>
        </button>
        <button
          className={`odds-row ${awayOdds > drawOdds && awayOdds > homeOdds ? "is-leading" : ""}`}
          type="button"
        >
          <span>{fixture.awayTeam} wins</span>
          <span className="bar" style={{ "--value": `${awayOdds}%` } as React.CSSProperties}></span>
          <strong>{awayOdds}%</strong>
        </button>
      </div>

      <div className="trade-actions">
        <Link
          href={`/fixtures/${fixture.fifaMatchId}/match-winner`}
          className="trade-button yes"
        >
          Trade Match Winner
        </Link>
        <Link
          href={`/fixtures/${fixture.fifaMatchId}/exact-score`}
          className="trade-button no"
        >
          Trade Exact Score
        </Link>
      </div>
    </article>
  );
}
