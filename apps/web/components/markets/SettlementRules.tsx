import type { ResolutionRule } from "@polygoal/shared";

export function SettlementRules({ rule, settlementRule }: { rule?: ResolutionRule; settlementRule?: string }) {
  if (!rule && !settlementRule) return null;
  return (
    <section className="card stack settlement-rules">
      <h3>Settlement rules</h3>
      {rule?.humanText ? <p className="kpi">{rule.humanText}</p> : settlementRule ? <p className="kpi">{settlementRule}</p> : null}
      {rule?.bullets?.length ? (
        <ul className="settlement-rules-list">
          {rule.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {rule?.challengeWindowSeconds ? (
        <p className="kpi"><strong>Challenge window:</strong> {Math.round(rule.challengeWindowSeconds / 60)} minutes after the proposed result.</p>
      ) : null}
    </section>
  );
}
