export type TransactionState = "idle" | "confirming" | "success" | "failed";

const labels: Record<TransactionState, string> = {
  idle: "Ready",
  confirming: "Confirming",
  success: "Confirmed",
  failed: "Failed",
};

export function TransactionStateBadge({ state }: { state: TransactionState }) {
  return <span className={`badge tx-${state}`}>{labels[state]}</span>;
}
