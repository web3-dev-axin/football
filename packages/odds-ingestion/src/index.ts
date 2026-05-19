import { DEMO_MARKET_ID, type DataQualityStatus } from "@polygoal/shared";

export type OddsProviderName = "fifa_reference" | "provider_a" | "provider_b";

export type OddsSnapshot = {
  id: string;
  marketId: string;
  provider: OddsProviderName;
  outcomeProbabilitiesBps: number[];
  sourceTimestamp: string;
  ingestedAt: string;
  raw: Record<string, unknown>;
};

export type OddsMismatch = {
  outcomeIndex: number;
  officialProbabilityBps: number;
  providerProbabilityBps: number;
  deviationBps: number;
  severity: "warning" | "critical";
  action: "show_deviation_badge" | "auto_pause_market";
};

export type OddsComparison = {
  id: string;
  marketId: string;
  status: DataQualityStatus;
  maxDeviationBps: number;
  mismatches: OddsMismatch[];
  comparedAt: string;
};

export type ExactScoreProviderOutcome = {
  label: string;
  providerOutcomeId: string;
  decimalOdds: number;
  impliedProbabilityBps: number;
  status: "available" | "missing";
};

export type ExactScoreOdds = {
  fixtureId: string;
  marketType: "exact_score";
  provider: OddsProviderName;
  providerMarketId: string;
  lastUpdatedAt: string;
  outcomes: ExactScoreProviderOutcome[];
};

export const ODDS_WARNING_DEVIATION_BPS = 500;
export const ODDS_CRITICAL_DEVIATION_BPS = 1500;

export function buildDemoOddsSnapshots(input: { marketId?: string; officialProbabilityBps?: number; providerProbabilityBps?: number } = {}): [OddsSnapshot, OddsSnapshot] {
  const marketId = input.marketId ?? DEMO_MARKET_ID;
  const official = input.officialProbabilityBps ?? 5000;
  const provider = input.providerProbabilityBps ?? 5100;
  const now = "2026-06-13T22:25:00.000Z";
  return [
    { id: `odds:${marketId}:fifa_reference`, marketId, provider: "fifa_reference", outcomeProbabilitiesBps: [official, 10000 - official], sourceTimestamp: now, ingestedAt: now, raw: { marketId, official } },
    { id: `odds:${marketId}:provider_a`, marketId, provider: "provider_a", outcomeProbabilitiesBps: [provider, 10000 - provider], sourceTimestamp: now, ingestedAt: now, raw: { marketId, provider } },
  ];
}

export function compareOddsSnapshots(official: OddsSnapshot, provider: OddsSnapshot): OddsComparison {
  const deviations = official.outcomeProbabilitiesBps.map((officialProbabilityBps, outcomeIndex) => Math.abs(officialProbabilityBps - (provider.outcomeProbabilitiesBps[outcomeIndex] ?? 0)));
  const mismatches = official.outcomeProbabilitiesBps.flatMap((officialProbabilityBps, outcomeIndex): OddsMismatch[] => {
    const providerProbabilityBps = provider.outcomeProbabilitiesBps[outcomeIndex] ?? 0;
    const deviationBps = deviations[outcomeIndex] ?? 0;
    if (deviationBps < ODDS_WARNING_DEVIATION_BPS) return [];
    const critical = deviationBps >= ODDS_CRITICAL_DEVIATION_BPS;
    return [{
      outcomeIndex,
      officialProbabilityBps,
      providerProbabilityBps,
      deviationBps,
      severity: critical ? "critical" : "warning",
      action: critical ? "auto_pause_market" : "show_deviation_badge",
    }];
  });
  const maxDeviationBps = deviations.reduce((max, deviationBps) => Math.max(max, deviationBps), 0);
  return {
    id: `odds-comparison:${official.marketId}:${provider.provider}`,
    marketId: official.marketId,
    status: mismatches.some((mismatch) => mismatch.severity === "critical") ? "data_review_required" : "verified",
    maxDeviationBps,
    mismatches,
    comparedAt: "2026-06-13T22:26:00.000Z",
  };
}

export function syncDemoOdds(input: { marketId?: string; providerProbabilityBps?: number } = {}) {
  const snapshots = buildDemoOddsSnapshots(input);
  const comparison = compareOddsSnapshots(snapshots[0], snapshots[1]);
  return { snapshots, comparison };
}

export function buildDemoExactScoreOdds(input: { fixtureId: string; provider?: OddsProviderName }): ExactScoreOdds {
  const provider = input.provider ?? "provider_a";
  const providerMarketId = `${provider}:correct_score:${input.fixtureId}`;
  const odds = [
    ["0-0", 8.5, 1180],
    ["1-0", 6.2, 1610],
    ["0-1", 7.1, 1410],
    ["1-1", 5.8, 1720],
    ["2-0", 8.9, 1120],
    ["0-2", 10.5, 950],
    ["2-1", 7.4, 1350],
    ["1-2", 9.8, 1020],
    ["2-2", 12.0, 830],
    ["Other score", 4.8, 2080],
  ] as const;
  return {
    fixtureId: input.fixtureId,
    marketType: "exact_score",
    provider,
    providerMarketId,
    lastUpdatedAt: "2026-06-13T22:25:00.000Z",
    outcomes: odds.map(([label, decimalOdds, impliedProbabilityBps]) => ({
      label,
      providerOutcomeId: `${provider}:correct_score:${label.toLowerCase().replaceAll(" ", "_")}`,
      decimalOdds,
      impliedProbabilityBps,
      status: "available",
    })),
  };
}
