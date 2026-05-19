import type { Market, ResultProposal } from "@worldcup/shared";

export function SettlementPanel({ market, proposal }: { market: Market; proposal?: ResultProposal }) {
  const outcomeLabel = proposal?.winningOutcome === 0 ? "Yes" : proposal?.winningOutcome === 1 ? "No" : "Pending";
  return (
    <section className="card stack">
      <h2>Settlement</h2>
      <p>Proposed result: {outcomeLabel}</p>
      <p>Goals detected in window: {proposal?.goalCountInWindow ?? 0}</p>
      <dl className="metric-list">
        <div className="metric-row">
          <dt>Evidence</dt>
          <dd>{proposal?.evidenceUri ?? "waiting for event comparison"}</dd>
        </div>
        <div className="metric-row">
          <dt>Market status</dt>
          <dd>{market.status}</dd>
        </div>
      </dl>
      <button className="button" disabled={market.status !== "redeemable"}>Redeem winning shares</button>
    </section>
  );
}
