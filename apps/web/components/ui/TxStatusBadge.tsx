export type TxStatus = "idle" | "approving" | "submitting" | "confirming" | "success" | "failed";

const labelMap: Record<TxStatus, string> = {
  idle: "Ready",
  approving: "Approving USDC",
  submitting: "Submitting",
  confirming: "Confirming on chain",
  success: "Success",
  failed: "Failed",
};

const classMap: Record<TxStatus, string> = {
  idle: "badge tx-idle",
  approving: "badge tx-confirming",
  submitting: "badge tx-confirming",
  confirming: "badge tx-confirming",
  success: "badge tx-success",
  failed: "badge danger tx-failed",
};

export function TxStatusBadge({ status, txHash, explorerUrl }: { status: TxStatus; txHash?: string; explorerUrl?: string }) {
  if (status === "idle") return null;
  const label = labelMap[status];
  if (txHash && explorerUrl) {
    return (
      <a className={classMap[status]} href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener" aria-label={`${label}. View transaction on explorer.`}>
        {label} · View tx ↗
      </a>
    );
  }
  return <span className={classMap[status]} role="status">{label}</span>;
}
