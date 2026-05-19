import type {
  CommercialFeatureFlags,
  CommercialMarketDefinition,
  Fixture,
  Market,
  MatchEvent,
  ResultProposal,
  RiskDecision,
  Trade,
} from "@polygoal/shared";

export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
  }
}

function resolveBaseUrl(override?: string): string {
  if (override) return override;
  // Server-side (SSR / route handlers): bypass the browser entirely and hit the
  // API directly via loopback. Avoids the public origin → loopback PNA block
  // and avoids paying the nginx hop on every server render.
  if (typeof window === "undefined") {
    return (
      process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_INTERNAL_URL ??
      "http://127.0.0.1:8787"
    );
  }
  // Browser: default to a same-origin path that nginx (or `next.config` rewrites
  // in dev) proxies to the API. This sidesteps cross-origin + Private Network
  // Access entirely.
  return process.env.NEXT_PUBLIC_API_URL ?? "/api";
}

export async function apiGet<T>(path: string, baseUrl?: string): Promise<T> {
  const response = await fetch(`${resolveBaseUrl(baseUrl)}${path}`, { cache: "no-store" });
  if (!response.ok) {
    const detail = await safeJson(response);
    throw new ApiClientError(response.status, detail?.error?.message ?? `API request failed: ${path}`, detail?.error?.code);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, baseUrl?: string): Promise<T> {
  const response = await fetch(`${resolveBaseUrl(baseUrl)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await safeJson(response);
    throw new ApiClientError(response.status, detail?.error?.message ?? `API request failed: ${path}`, detail?.error?.code);
  }
  return response.json() as Promise<T>;
}

async function safeJson(response: Response): Promise<{ error?: { message?: string; code?: string } } | undefined> {
  try {
    return (await response.json()) as { error?: { message?: string; code?: string } };
  } catch {
    return undefined;
  }
}

export const consumerApi = {
  async listCommercialMarkets(params: { fixtureId?: string; marketType?: "match_winner" | "exact_score" } = {}): Promise<CommercialMarketDefinition[]> {
    const search = new URLSearchParams();
    if (params.fixtureId) search.set("fixtureId", params.fixtureId);
    if (params.marketType) search.set("marketType", params.marketType);
    const query = search.toString() ? `?${search.toString()}` : "";
    const { commercialMarkets } = await apiGet<{ commercialMarkets: CommercialMarketDefinition[] }>(`/commercial-markets${query}`);
    return commercialMarkets;
  },
  async listSchedule(): Promise<Fixture[]> {
    const { fixtures } = await apiGet<{ fixtures: Fixture[] }>("/schedule");
    return fixtures;
  },
  async listFixtures(status?: string): Promise<Fixture[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const { fixtures } = await apiGet<{ fixtures: Fixture[] }>(`/fixtures${query}`);
    return fixtures;
  },
  async getFixtureEvents(fixtureId: string): Promise<MatchEvent[]> {
    const { events } = await apiGet<{ fixtureId: string; events: MatchEvent[] }>(`/fixtures/${encodeURIComponent(fixtureId)}/events`);
    return events;
  },
  async getMarket(marketId: string): Promise<Market> {
    const { market } = await apiGet<{ market: Market }>(`/markets/${encodeURIComponent(marketId)}`);
    return market;
  },
  async listMarkets(status?: string): Promise<Market[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const { markets } = await apiGet<{ markets: Market[] }>(`/markets${query}`);
    return markets;
  },
  async getOddsForMarket(marketId: string): Promise<{ comparison: { id: string; status: "verified" | "data_review_required"; maxDeviationBps: number }; snapshots: Array<{ source: string; outcomeProbabilitiesBps: number[] }> }> {
    return apiGet(`/odds/markets/${encodeURIComponent(marketId)}`);
  },
  async listSettlements(status?: "proposed" | "challenged" | "finalized" | "voided"): Promise<ResultProposal[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const { settlements } = await apiGet<{ settlements: ResultProposal[] }>(`/settlements${query}`);
    return settlements;
  },
  async getPortfolio(walletAddress: string): Promise<{ positions: Trade[]; summary: { walletAddress: string; positionCount: number } }> {
    return apiGet(`/portfolio/${encodeURIComponent(walletAddress)}`);
  },
  async checkRisk(input: { marketId: string; userExposureRaw: string; marketVolumeRaw: string; orderAmountRaw: string }): Promise<RiskDecision> {
    const { decision } = await apiPost<{ decision: RiskDecision }>("/risk/check", input);
    return decision;
  },
  async getFeatureFlags(): Promise<CommercialFeatureFlags> {
    const { featureFlags } = await apiGet<{ featureFlags: CommercialFeatureFlags }>("/admin/feature-flags");
    return featureFlags;
  },
};

export function humanizeApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case "USER_LIMIT_EXCEEDED":
        return "You're at the per-user exposure limit. Try a smaller amount.";
      case "MARKET_LIMIT_EXCEEDED":
        return "This market reached its volume limit. Try again later.";
      case "ORDER_LIMIT_EXCEEDED":
        return "Order amount exceeds the per-order limit. Try a smaller amount.";
      case "RISK_LIMIT_DISABLED":
        return "Trading is paused on this market.";
      case "MARKET_NOT_FOUND":
        return "Market not found.";
      case "FIXTURE_NOT_FOUND":
        return "Fixture not found.";
      case "DATA_QUALITY_REVIEW_REQUIRED":
        return "Data quality review in progress. Try again shortly.";
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : "Unknown error";
}
