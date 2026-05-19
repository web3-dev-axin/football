import type { Fixture } from "@polygoal/shared";
import { DataFreshnessBadge } from "../ui/DataFreshnessBadge";
import { teamMeta } from "../../lib/teams";

export function FixtureHero({ fixture }: { fixture: Fixture }) {
  const isLive = fixture.status === "live";
  const isFinal = fixture.status === "full_time" || fixture.status === "final";
  const isScheduled = fixture.status === "scheduled";
  const home = teamMeta(fixture.homeTeam);
  const away = teamMeta(fixture.awayTeam);

  const kickoff = new Date(fixture.kickoffAtUtc);
  const kickoffDate = kickoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const kickoffTime = kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const countdown = isScheduled ? humanCountdown(kickoff.getTime() - Date.now()) : null;

  return (
    <section className="fixture-hero">
      <div className="fixture-hero-eyebrow">
        <span>Match {fixture.matchNumber}</span>
        <span className="fixture-hero-eyebrow-sep" aria-hidden>·</span>
        <span>FIFA World Cup 2026</span>
      </div>

      <div className="fixture-hero-board">
        <div className="fixture-hero-team fixture-hero-team-home">
          <div className="fixture-hero-team-flag" aria-hidden>{home.flag}</div>
          <div className="fixture-hero-team-text">
            <span className="fixture-hero-team-label">Home</span>
            <strong className="fixture-hero-team-name">{fixture.homeTeam}</strong>
            <span className="fixture-hero-team-code">{home.code}</span>
          </div>
        </div>

        <div className="fixture-hero-center">
          {isLive ? <LiveCenter fixture={fixture} /> : null}
          {isFinal ? <FinalCenter fixture={fixture} /> : null}
          {isScheduled ? <ScheduledCenter kickoffDate={kickoffDate} kickoffTime={kickoffTime} countdown={countdown} /> : null}
          {!isLive && !isFinal && !isScheduled ? <StatusCenter label={fixture.status.replace(/_/g, " ")} /> : null}
        </div>

        <div className="fixture-hero-team fixture-hero-team-away">
          <div className="fixture-hero-team-text">
            <span className="fixture-hero-team-label">Away</span>
            <strong className="fixture-hero-team-name">{fixture.awayTeam}</strong>
            <span className="fixture-hero-team-code">{away.code}</span>
          </div>
          <div className="fixture-hero-team-flag" aria-hidden>{away.flag}</div>
        </div>
      </div>

      <footer className="fixture-hero-footer">
        <span className="fixture-hero-meta-item">
          <span className="fixture-hero-meta-icon" aria-hidden>📍</span>
          {fixture.venue}
        </span>
        {!isLive ? (
          <span className="fixture-hero-meta-item">
            <span className="fixture-hero-meta-icon" aria-hidden>🗓</span>
            {kickoffDate}, {kickoffTime}
          </span>
        ) : null}
        {countdown ? (
          <span className="fixture-hero-meta-item">
            <span className="fixture-hero-meta-icon" aria-hidden>⏱</span>
            Kicks off in {countdown}
          </span>
        ) : null}
        <DataFreshnessBadge status={fixture.dataQualityStatus} />
      </footer>
    </section>
  );
}

function LiveCenter({ fixture }: { fixture: Fixture }) {
  return (
    <>
      <span className="fixture-hero-status fixture-hero-status-live">
        <span className="fixture-hero-status-dot" aria-hidden />
        Live · {fixture.displayClock}
      </span>
      <div className="fixture-hero-score">
        <span>{fixture.homeScore}</span>
        <span className="fixture-hero-score-sep" aria-hidden>:</span>
        <span>{fixture.awayScore}</span>
      </div>
    </>
  );
}

function FinalCenter({ fixture }: { fixture: Fixture }) {
  return (
    <>
      <span className="fixture-hero-status fixture-hero-status-final">Full time</span>
      <div className="fixture-hero-score">
        <span>{fixture.homeScore}</span>
        <span className="fixture-hero-score-sep" aria-hidden>:</span>
        <span>{fixture.awayScore}</span>
      </div>
    </>
  );
}

function ScheduledCenter({ kickoffDate, kickoffTime, countdown }: { kickoffDate: string; kickoffTime: string; countdown: string | null }) {
  return (
    <>
      <span className="fixture-hero-status fixture-hero-status-scheduled">Kickoff</span>
      <div className="fixture-hero-kickoff">
        <strong>{kickoffTime}</strong>
        <small>{kickoffDate}</small>
      </div>
      {countdown ? <span className="fixture-hero-countdown">in {countdown}</span> : null}
    </>
  );
}

function StatusCenter({ label }: { label: string }) {
  return (
    <span className="fixture-hero-status fixture-hero-status-scheduled" style={{ textTransform: "capitalize" }}>
      {label}
    </span>
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
