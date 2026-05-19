import type { DataQualityStatus } from "@worldcup/shared";

export function DataQualityBadge({ status }: { status: DataQualityStatus }) {
  const label = status === "verified" ? "data quality: verified" : status === "data_review_required" ? "data review required" : "data pending";
  return <span className={status === "verified" ? "badge" : "badge warn"}>{label}</span>;
}
