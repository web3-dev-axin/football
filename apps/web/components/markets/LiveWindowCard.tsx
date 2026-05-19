import type { LiveWindow, Market } from "@worldcup/shared";
import { DataQualityBadge } from "../ui/DataQualityBadge";

export function LiveWindowCard({ liveWindow, market }: { liveWindow: LiveWindow; market?: Market }) {
  return (
    <article className="card stack">
      <DataQualityBadge status={liveWindow.dataQualityStatus} />
      <h3>{liveWindow.title}</h3>
      <p className="kpi fixture-meta">
        <span>Window {liveWindow.startMatchSecond / 60}:00-{liveWindow.endMatchSecond / 60}:00</span>
        <span>status {market?.status ?? liveWindow.status}</span>
      </p>
      <p>Outcomes: Yes / No</p>
      <a className="button" href={`/markets/${market?.id ?? liveWindow.marketId ?? "market-demo-63-73"}`}>Open market</a>
    </article>
  );
}
