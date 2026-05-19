import type { CommercialFeatureFlags, CommercialMarketDefinition, MarketPause, ProviderHealthCheck, RiskLimit } from "@worldcup/shared";
import type { Fixture, LiveWindow, Market, ResultProposal } from "@worldcup/shared";

export type PredictionMarketRepository = {
  listFixtures(status?: string): Fixture[] | Promise<Fixture[]>;
  createLiveWindow(input: { fixtureId: string; startMatchSecond: number; endMatchSecond: number }): LiveWindow | Promise<LiveWindow>;
  createMarket(liveWindowId: string): Market | Promise<Market>;
  proposeResult(marketId: string, evidenceUri: string): ResultProposal | Promise<ResultProposal>;
  finalizeResult(marketId: string): ResultProposal | Promise<ResultProposal>;
  getFeatureFlags(): CommercialFeatureFlags | Promise<CommercialFeatureFlags>;
  upsertRiskLimit(limit: RiskLimit): RiskLimit | Promise<RiskLimit>;
  recordProviderHealth(input: Omit<ProviderHealthCheck, "id" | "checkedAt">): ProviderHealthCheck | Promise<ProviderHealthCheck>;
  pauseMarket(marketId: string, operatorId: string, reason: string): MarketPause | Promise<MarketPause>;
  createCommercialLiveWindow(input: { fixtureId: string; marketType: CommercialMarketDefinition["marketType"]; startMatchSecond: number; endMatchSecond?: number }): CommercialMarketDefinition | Promise<CommercialMarketDefinition>;
};

export type RepositoryMode = "memory" | "postgres";

export function getRepositoryMode(env: NodeJS.ProcessEnv = process.env): RepositoryMode {
  return env.DATABASE_URL ? "postgres" : "memory";
}
