import type { DbState } from "@worldcup/db";

export function listAuditLogs(db: { state: Pick<DbState, "auditLogs"> }) {
  return db.state.auditLogs;
}
