import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("documented import scripts", () => {
  test("provides official snapshot and odds import entrypoints", () => {
    for (const file of ["apps/api/scripts/import-official-snapshot.ts", "apps/api/scripts/import-provider-odds.ts"]) {
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toContain("reports/");
    }
  });
});
