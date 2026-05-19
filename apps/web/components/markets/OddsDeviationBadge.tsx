import type { DataQualityStatus } from "@worldcup/shared";

export function OddsDeviationBadge({ status, maxDeviationBps }: { status: DataQualityStatus; maxDeviationBps: number }) {
  const deviation = `${(maxDeviationBps / 100).toFixed(2)}%`;
  if (status === "data_review_required") return <span className="badge warn">Odds review required · max deviation {deviation}</span>;
  return <span className="badge">Odds verified · max deviation {deviation}</span>;
}
