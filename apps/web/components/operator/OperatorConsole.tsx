import type { InMemoryDb } from "@worldcup/db";

export function OperatorConsole({ db }: { db: InMemoryDb }) {
  const flags = db.getFeatureFlags();
  return (
    <main className="stack">
      <section className="card stack">
        <span className="badge warn">Operator only</span>
        <h1>Operator Console</h1>
        <p className="kpi">Monitor provider health, feature gates, market pauses, challenges, refunds, risk limits, and audit logs.</p>
      </section>
      <section className="grid">
        <div className="card stack">
          <h2>Feature Flags</h2>
          <dl className="metric-list">
            {Object.entries(flags).map(([key, value]) => (
              <div className="metric-row" key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card stack">
          <h2>Risk Limits</h2>
          <dl className="metric-list">
            {db.state.riskLimits.map((limit) => (
              <div className="metric-row" key={`${limit.scope}:${limit.subjectId}`}>
                <dt>{limit.scope}:{limit.subjectId}</dt>
                <dd>order {limit.maxOrderAmountRaw}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card stack">
          <h2>Market Operations</h2>
          {db.state.marketPauses.length === 0 ? <p>No active pauses</p> : db.state.marketPauses.map((pause) => <p key={pause.id}>{pause.marketId}: {pause.status} - {pause.reason}</p>)}
        </div>
      </section>
      <section className="card stack">
        <h2>Audit Trail</h2>
        {db.state.auditLogs.map((log) => <p key={log.id}>{log.action} by {log.actorId}</p>)}
      </section>
    </main>
  );
}
