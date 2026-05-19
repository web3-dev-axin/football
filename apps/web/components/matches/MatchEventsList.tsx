import type { MatchEvent } from "@polygoal/shared";
import { EmptyState } from "../ui/EmptyState";

const ICONS: Record<MatchEvent["eventType"], string> = {
  goal: "⚽",
  goal_cancelled: "🚫",
  var_review: "🟦",
  half_start: "▶",
  half_end: "⏸",
  full_time: "⏹",
};

export function MatchEventsList({ events }: { events: MatchEvent[] }) {
  if (events.length === 0) {
    return <EmptyState compact icon="🎙" title="Waiting for the first whistle" description="Goals, VAR reviews, and half-time updates appear here in real time as the match unfolds." />;
  }
  return (
    <ul className="match-events-list" aria-label="Match events">
      {events.map((event) => (
        <li key={event.id} className={event.isCancelled ? "match-event cancelled" : "match-event"}>
          <span className="match-event-time">{event.matchMinute}'</span>
          <span className="match-event-icon" aria-hidden="true">{ICONS[event.eventType] ?? "•"}</span>
          <span className="match-event-text">
            {event.eventType === "goal" && `${event.team} goal`}
            {event.eventType === "goal_cancelled" && `${event.team} goal cancelled`}
            {event.eventType === "var_review" && "VAR review"}
            {event.eventType === "half_start" && "Half starts"}
            {event.eventType === "half_end" && "Half ends"}
            {event.eventType === "full_time" && "Full time"}
          </span>
        </li>
      ))}
    </ul>
  );
}
