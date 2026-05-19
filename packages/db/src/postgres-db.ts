import postgres from "postgres";
import type { ChallengeReviewStatus, CommercialFeatureFlags, CommercialMarketType, Fixture, ProviderHealthCheck, RiskLimit, RiskLimitScope } from "@worldcup/shared";
import { createDemoState, InMemoryDb, type DbState } from "./client";
import { applyPostgresMigrations, assertResetIsSafe, loadPostgresState, persistPostgresState, resetPostgres } from "./postgres-flow";

export type PostgresDbOptions = {
  reset?: boolean;
};

function replaceState(target: DbState, source: DbState): void {
  Object.assign(target, source);
}

export class PostgresDb {
  public readonly state: DbState = createDemoState();
  private readonly memory = new InMemoryDb(this.state);

  private constructor(private readonly sql: postgres.Sql) {
  }

  static async create(databaseUrl: string, options: PostgresDbOptions = {}): Promise<PostgresDb> {
    if (options.reset) assertResetIsSafe(databaseUrl);
    const db = new PostgresDb(postgres(databaseUrl, { max: 5, connect_timeout: 5 }));
    await applyPostgresMigrations(db.sql);
    if (options.reset) await resetPostgres(db.sql);

    const [{ count }] = await db.sql<Array<{ count: string }>>`select count(*)::text as count from fixtures`;
    if (Number(count) === 0) {
      await persistPostgresState(db.sql, createDemoState());
    }
    await db.reload();
    return db;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  private async reload(): Promise<void> {
    replaceState(this.state, await loadPostgresState(this.sql));
  }

  private async save(): Promise<void> {
    await persistPostgresState(this.sql, this.state);
  }

  async listFixtures(status?: string) {
    await this.reload();
    return this.memory.listFixtures(status);
  }

  async getFixture(fixtureId: string) {
    await this.reload();
    return this.memory.getFixture(fixtureId);
  }

  async getComparison(subjectType: Parameters<InMemoryDb["getComparison"]>[0], subjectKey: string) {
    await this.reload();
    return this.memory.getComparison(subjectType, subjectKey);
  }

  async compareFixtureData(fixtureId: string) {
    await this.reload();
    const comparison = this.memory.compareFixtureData(fixtureId);
    await this.save();
    return comparison;
  }

  async injectFixtureMismatch(fixtureId: string, field: keyof Fixture, providerValue: unknown) {
    await this.reload();
    const comparison = this.memory.injectFixtureMismatch(fixtureId, field, providerValue);
    await this.save();
    return comparison;
  }

  async createLiveWindow(input: { fixtureId: string; startMatchSecond: number; endMatchSecond: number }) {
    await this.reload();
    const liveWindow = this.memory.createLiveWindow(input);
    await this.save();
    return liveWindow;
  }

  async listLiveWindows(status?: string) {
    await this.reload();
    return this.memory.listLiveWindows(status);
  }

  async createMarket(liveWindowId: string) {
    await this.reload();
    const market = this.memory.createMarket(liveWindowId);
    await this.save();
    return market;
  }

  async listMarkets(status?: string) {
    await this.reload();
    return this.memory.listMarkets(status);
  }

  async getMarket(marketId: string) {
    await this.reload();
    return this.memory.getMarket(marketId);
  }

  async listTeams() {
    await this.reload();
    return this.memory.listTeams();
  }

  async listSchedule() {
    await this.reload();
    return this.memory.listSchedule();
  }

  async syncDemoMarketOdds(marketId?: string, providerProbabilityBps?: number) {
    await this.reload();
    const comparison = this.memory.syncDemoMarketOdds(marketId, providerProbabilityBps);
    await this.save();
    return comparison;
  }

  async getMarketOddsComparison(marketId: string) {
    await this.reload();
    return this.memory.getMarketOddsComparison(marketId);
  }

  async syncDemoLiveEvents(mode: "demo_goal" | "demo_no_goal" | "demo_cancelled_goal") {
    await this.reload();
    const result = this.memory.syncDemoLiveEvents(mode);
    await this.save();
    return result;
  }

  async compareLiveEvents(fixtureId: string, startMatchSecond: number, endMatchSecond: number) {
    await this.reload();
    const comparison = this.memory.compareLiveEvents(fixtureId, startMatchSecond, endMatchSecond);
    await this.save();
    return comparison;
  }

  async proposeResult(marketId: string, evidenceUri: string, now?: Date) {
    await this.reload();
    const proposal = this.memory.proposeResult(marketId, evidenceUri, now);
    await this.save();
    return proposal;
  }

  async finalizeResult(marketId: string, now?: Date) {
    await this.reload();
    const proposal = this.memory.finalizeResult(marketId, now);
    await this.save();
    return proposal;
  }

  async getFeatureFlags() {
    await this.reload();
    return this.memory.getFeatureFlags();
  }

  async setFeatureFlag(flag: keyof CommercialFeatureFlags, value: boolean, operatorId: string) {
    await this.reload();
    const flags = this.memory.setFeatureFlag(flag, value, operatorId);
    await this.save();
    return flags;
  }

  async getRiskLimit(scope: RiskLimitScope, subjectId: string) {
    await this.reload();
    return this.memory.getRiskLimit(scope, subjectId);
  }

  async upsertRiskLimit(limit: RiskLimit) {
    await this.reload();
    const saved = this.memory.upsertRiskLimit(limit);
    await this.save();
    return saved;
  }

  async recordProviderHealth(input: Omit<ProviderHealthCheck, "id" | "checkedAt">) {
    await this.reload();
    const saved = this.memory.recordProviderHealth(input);
    await this.save();
    return saved;
  }

  async autoPauseMarketForProviderDelay(marketId: string, reason: string) {
    await this.reload();
    const pause = this.memory.autoPauseMarketForProviderDelay(marketId, reason);
    await this.save();
    return pause;
  }

  async createCommercialLiveWindow(input: { fixtureId: string; marketType: CommercialMarketType; startMatchSecond: number; endMatchSecond?: number }) {
    await this.reload();
    const market = this.memory.createCommercialLiveWindow(input);
    await this.save();
    return market;
  }

  async pauseMarket(marketId: string, operatorId: string, reason: string) {
    await this.reload();
    const pause = this.memory.pauseMarket(marketId, operatorId, reason);
    await this.save();
    return pause;
  }

  async resumeMarket(marketId: string, operatorId: string, reason: string) {
    await this.reload();
    const pause = this.memory.resumeMarket(marketId, operatorId, reason);
    await this.save();
    return pause;
  }

  async createChallenge(input: Parameters<InMemoryDb["createChallenge"]>[0]) {
    await this.reload();
    const challenge = this.memory.createChallenge(input);
    await this.save();
    return challenge;
  }

  async reviewChallenge(challengeId: string, operatorId: string, status: Exclude<ChallengeReviewStatus, "open">, reviewNote: string) {
    await this.reload();
    const challenge = this.memory.reviewChallenge(challengeId, operatorId, status, reviewNote);
    await this.save();
    return challenge;
  }

  async voidMarketByOperator(marketId: string, operatorId: string, reason: string) {
    await this.reload();
    const market = this.memory.voidMarketByOperator(marketId, operatorId, reason);
    await this.save();
    return market;
  }

  async queueRefund(marketId: string, operatorId: string, walletAddress: `0x${string}`, reason: string) {
    await this.reload();
    const refund = this.memory.queueRefund(marketId, operatorId, walletAddress, reason);
    await this.save();
    return refund;
  }
}
