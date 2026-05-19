import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

describe("commercial schema", () => {
  test("keeps a single pre-release schema migration", () => {
    const files = readdirSync("packages/db/migrations").filter((file) => file.endsWith(".sql")).sort();
    expect(files).toEqual(["001_mvp_schema.sql"]);
  });

  test("declares required commercial operations tables", () => {
    const schema = readFileSync("packages/db/migrations/001_mvp_schema.sql", "utf8");
    for (const table of ["operator_actions", "risk_limits", "market_pauses", "liquidity_snapshots", "provider_health_checks", "audit_logs", "feature_flags", "challenges", "user_positions", "indexed_blocks"]) {
      expect(schema).toContain(`create table if not exists ${table}`);
    }
    expect(schema).toContain("unique (chain_id, block_number)");
    expect(schema).toContain("unique (scope, subject_id)");
  });
});
