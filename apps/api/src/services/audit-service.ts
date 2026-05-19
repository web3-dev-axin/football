import type { DbState } from "@polygoal/db";

export function listAuditLogs(db: { state: Pick<DbState, "auditLogs"> }) {
  return db.state.auditLogs;
}
