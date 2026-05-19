import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("commercial schema", () => {
  test("declares required commercial operations tables", () => {
    const schema = readFileSync("packages/db/migrations/002_commercial_schema.sql", "utf8");
    for (const table of ["operator_actions", "risk_limits", "market_pauses", "liquidity_snapshots", "provider_health_checks", "audit_logs", "feature_flags", "challenges", "user_positions", "indexed_blocks"]) {
      expect(schema).toContain(`create table if not exists ${table}`);
    }
    expect(schema).toContain("unique (chain_id, block_number)");
    expect(schema).toContain("unique (scope, subject_id)");
  });
});
