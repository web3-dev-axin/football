import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

describe("documentation and ops parity", () => {
  test("includes data source and resolution rule docs", () => {
    expect(existsSync("docs/data-sources.md")).toBe(true);
    expect(existsSync("docs/resolution-rules.md")).toBe(true);
  });

  test("includes odds env vars and CI gate", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).toContain("ODDS_DATA_PROVIDERS");
    expect(env).toContain("ODDS_API_KEY");
    expect(existsSync(".github/workflows/ci.yml")).toBe(true);
  });

  test("odds ingestion has provider and normalizer modules", () => {
    expect(existsSync("packages/odds-ingestion/src/providers/demo.ts")).toBe(true);
    expect(existsSync("packages/odds-ingestion/src/normalizers/odds.ts")).toBe(true);
  });
});
