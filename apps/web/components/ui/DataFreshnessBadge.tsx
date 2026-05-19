import type { DataQualityStatus } from "@polygoal/shared";

const labels: Record<DataQualityStatus, string> = {
  verified: "Data verified",
  data_review_required: "Data review",
  pending: "Data pending",
};

export function DataFreshnessBadge({ status, source, ageSeconds }: { status: DataQualityStatus; source?: string; ageSeconds?: number }) {
  const label = labels[status] ?? "Data";
  const suffix = source ? ` · ${source}${typeof ageSeconds === "number" ? ` · ${formatAge(ageSeconds)} ago` : ""}` : "";
  return <span className={status === "verified" ? "badge" : "badge warn"}>{label}{suffix}</span>;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
