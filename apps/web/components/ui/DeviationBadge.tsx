import type { DataQualityStatus } from "@polygoal/shared";

export function DeviationBadge({ status, maxDeviationBps }: { status: DataQualityStatus; maxDeviationBps: number }) {
  const pct = (maxDeviationBps / 100).toFixed(2);
  if (status === "data_review_required") {
    return <span className="badge warn">Odds review · spread {pct}%</span>;
  }
  return <span className="badge">Odds verified · spread {pct}%</span>;
}
