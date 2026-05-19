import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("odds and schedule schema", () => {
  test("declares commercial odds and schedule breadth tables", () => {
    const schema = readFileSync("packages/db/migrations/001_mvp_schema.sql", "utf8");
    for (const table of ["tournaments", "groups", "venues", "team_rankings", "odds_snapshots", "odds_comparisons"]) {
      expect(schema).toContain(`create table if not exists ${table}`);
    }
  });
});
