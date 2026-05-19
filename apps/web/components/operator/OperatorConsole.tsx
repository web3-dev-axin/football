import type { InMemoryDb } from "@polygoal/db";
import { Card, Chip } from "@heroui/react";
import { PageHero } from "../ui/PageHero";

function flagLabel(key: string) {
  return key.replace(/^enable/, "").replace(/[A-Z]/g, (match) => ` ${match}`).trim();
}

export function OperatorConsole({ db }: { db: InMemoryDb }) {
  const flags = db.getFeatureFlags();
  return (
    <main className="section-stack">
      <PageHero eyebrow="Operator only" title="Operator Console">
        Monitor provider health, feature gates, market pauses, challenges, refunds, risk limits, and audit logs.
      </PageHero>
      <section className="grid operator-grid">
        <Card variant="default" className="stack control-card">
          <Chip size="sm" variant="soft" color="success">Signal board</Chip>
          <h2>Feature Flags</h2>
          <dl className="metric-list panel-list">
            {Object.entries(flags).map(([key, value]) => (
              <div className="metric-row panel-row" key={key}>
                <dt>{flagLabel(key)}</dt>
                <dd>
                  <Chip size="sm" variant="soft" color={value ? "success" : "warning"}>
                    {value ? "On air" : "Standby"}
                  </Chip>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card variant="default" className="stack control-card">
          <Chip size="sm" variant="soft" color="success">Exposure desk</Chip>
          <h2>Risk Limits</h2>
          <dl className="metric-list panel-list">
            {db.state.riskLimits.map((limit) => (
              <div className="metric-row panel-row" key={`${limit.scope}:${limit.subjectId}`}>
                <dt>{limit.scope} scope</dt>
                <dd>order {limit.maxOrderAmountRaw}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card variant="default" className="stack control-card">
          <Chip size="sm" variant="soft" color="success">Operations feed</Chip>
          <h2>Market Operations</h2>
          {db.state.marketPauses.length === 0 ? <p>No active pauses</p> : db.state.marketPauses.map((pause) => (
            <p className="match-strip" key={pause.id}>
              <span className="status-dot" aria-hidden="true" />
              <span>{pause.status}</span>
              <span>provider status</span>
            </p>
          ))}
        </Card>
      </section>
      <Card variant="default" className="stack control-card">
        <Chip size="sm" variant="soft" color="success">Replay log</Chip>
        <h2>Audit Trail</h2>
        {db.state.auditLogs.map((log) => <p className="match-strip" key={log.id}><span>{log.action}</span><span>operator desk</span></p>)}
      </Card>
    </main>
  );
}
