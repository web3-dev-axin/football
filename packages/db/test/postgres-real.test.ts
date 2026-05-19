import { describe, expect, test } from "bun:test";

const databaseUrl = process.env.DATABASE_URL;

describe("real Postgres flow", () => {
  test("only allows reset for explicitly test-suffixed database names", async () => {
    const { assertResetIsSafe } = await import("../src/postgres-flow");

    expect(() => assertResetIsSafe("postgres://localhost:5432/polygoal_test")).not.toThrow();
    expect(() => assertResetIsSafe("postgres://localhost:5432/latest")).toThrow("Refusing to reset non-test database");
    expect(() => assertResetIsSafe("postgres://localhost:5432/contest")).toThrow("Refusing to reset non-test database");
    expect(() => assertResetIsSafe("postgres://localhost:5432/prod_test_backup")).toThrow("Refusing to reset non-test database");
  });

  test.skipIf(!databaseUrl)("persists demo market lifecycle in Postgres", async () => {
    const { runPostgresRealFlow } = await import("../src/postgres-flow");

    const report = await runPostgresRealFlow(databaseUrl!, { reset: true });

    expect(report.databaseMode).toBe("postgres");
    expect(report.counts.fixtures).toBeGreaterThanOrEqual(1);
    expect(report.counts.liveWindows).toBe(1);
    expect(report.counts.markets).toBe(1);
    expect(report.counts.matchEvents).toBe(1);
    expect(report.counts.resultProposals).toBe(1);
    expect(report.market.status).toBe("redeemable");
    expect(report.market.oracleState).toBe("finalized");
    expect(report.proposal.status).toBe("finalized");
    expect(report.proposal.goalCountInWindow).toBe(1);
  });
});
