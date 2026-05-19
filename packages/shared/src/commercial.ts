import type {
  CommercialFeatureFlags,
  CommercialMarketDefinition,
  CommercialMarketType,
  CommercialMarketTypeDefinition,
  ProviderHealthCheck,
  MatchEvent,
  ResolutionRule,
  ResolutionRuleCode,
  RiskDecision,
  RiskLimit,
} from "./types";

export const COMMERCIAL_MARKET_TYPES: CommercialMarketTypeDefinition[] = [
  { marketType: "match_winner", label: "Match Winner", outcomeLabels: ["Home", "Draw", "Away"], dataRequirements: ["fixture_result", "moneyline_odds"], riskLevel: "low", enabledByDefault: true, chainCreationEnabled: true, marketCategory: "core", displayPriority: 1, isFeatured: true },
  { marketType: "exact_score", label: "Exact Score", outcomeLabels: ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2", "Other score"], dataRequirements: ["fixture_result", "correct_score_odds"], riskLevel: "medium", enabledByDefault: true, chainCreationEnabled: false, marketCategory: "score", displayPriority: 2, isFeatured: false },
];

export const DEFAULT_COMMERCIAL_FEATURE_FLAGS: CommercialFeatureFlags = {
  enableRealCollateral: false,
  enableMatchWinnerMarket: true,
  enableExactScoreMarket: true,
  enableCardMarket: false,
  enableCornerMarket: false,
  enablePublicChallenge: false,
  enableUmaAdapter: false,
  enableGeoBlock: false,
  enableTradingFees: false,
};

export const DEFAULT_RISK_LIMITS: RiskLimit = {
  scope: "global",
  subjectId: "global",
  maxOrderAmountRaw: "1000000000",
  maxUserExposureRaw: "5000000000",
  maxMarketVolumeRaw: "50000000000",
  enabled: true,
};

export function getCommercialMarketType(marketType: CommercialMarketType): CommercialMarketTypeDefinition {
  const definition = COMMERCIAL_MARKET_TYPES.find((candidate) => candidate.marketType === marketType);
  if (!definition) throw new Error(`Unsupported market type: ${marketType}`);
  return definition;
}

export const RESOLUTION_RULES: Record<ResolutionRuleCode, ResolutionRule> = {
  full_time_match_winner_excluding_extra_time_and_penalties: {
    code: "full_time_match_winner_excluding_extra_time_and_penalties",
    humanText: "Resolves on the final score after 90 minutes including stoppage time. Extra time and penalties do not count.",
    bullets: [
      "Counts goals up to the end of the second half plus stoppage time.",
      "Extra time and penalty shootouts are ignored.",
      "Source of truth: FIFA official feed with provider cross-check.",
    ],
    challengeWindowSeconds: 600,
    excludesExtraTime: true,
    excludesPenalties: true,
  },
  full_time_exact_score_or_other_score: {
    code: "full_time_exact_score_or_other_score",
    humanText: "Resolves on the final score after 90 minutes including stoppage time. Scores not listed settle as Other score.",
    bullets: [
      "Final score after regulation time only.",
      "If the score is not listed as an outcome, the Other score outcome wins.",
      "Extra time and penalties do not change the resolved score.",
    ],
    challengeWindowSeconds: 600,
    excludesExtraTime: true,
    excludesPenalties: true,
  },
};

export function getResolutionRule(code: ResolutionRuleCode): ResolutionRule {
  return RESOLUTION_RULES[code];
}

const DEMO_ODDS_UPDATED_AT = "2026-06-13T22:25:00.000Z";

// Approximate Elo-style team strength (0-100 scale).
// Sources: blended snapshot of recent FIFA/eloratings.net + Opta power rankings (Mar 2026).
// Tuned so that diff/10 fed into a sigmoid gives win probabilities that line up with bookie consensus.
const TEAM_STRENGTH: Record<string, number> = {
  Argentina: 91, France: 90, Brazil: 89, Spain: 89, England: 87, Portugal: 86, Germany: 85, Netherlands: 85, Italy: 84, Belgium: 83,
  Croatia: 82, Uruguay: 81, Colombia: 80, Morocco: 79, Switzerland: 78, "United States": 77, Denmark: 77, Mexico: 76, Senegal: 76, Japan: 76,
  Sweden: 75, Australia: 74, Türkiye: 74, Austria: 74, Norway: 74, Poland: 73, "South Korea": 73, Czechia: 72, Iran: 72, Serbia: 72,
  Ecuador: 72, Tunisia: 71, Nigeria: 71, Egypt: 71, "Ivory Coast": 71, Cameroon: 71, Ghana: 70, Algeria: 70, Hungary: 70, Romania: 69,
  Greece: 69, Ukraine: 69, Slovakia: 68, Canada: 68, Chile: 68, Scotland: 68, Wales: 67, Peru: 66,
};

function teamStrength(name: string): number {
  return TEAM_STRENGTH[name] ?? 70;
}

function hashFixtureId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) / 2147483647;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// WC 2026 group stage is mostly played at neutral venues across USA/Canada/Mexico.
// Apply a small "ordering" advantage (first-listed side gets slight edge) but keep it modest.
const HOME_ADVANTAGE = 0.6;

// Elo-style sigmoid spread. Divisor 9 gives sane numbers across the strength range:
//   diff  5  -> 64% home win
//   diff 10  -> 75%
//   diff 15  -> 84%
//   diff 20  -> 90%
const STRENGTH_DIVISOR = 9;

export function deriveMatchWinnerProbabilities(input: { fixtureId: string; homeTeam: string; awayTeam: string }): { homeBps: number; drawBps: number; awayBps: number } {
  const jitter = (hashFixtureId(input.fixtureId) - 0.5) * 0.04;
  const diff = teamStrength(input.homeTeam) - teamStrength(input.awayTeam) + HOME_ADVANTAGE;

  // Expected home-vs-away win share (excluding the draw mass), capped to leave a realistic upset chance.
  const rawHomeWin = sigmoid(diff / STRENGTH_DIVISOR) + jitter;
  const homeWinShare = Math.max(0.05, Math.min(0.92, rawHomeWin));
  const awayWinShare = 1 - homeWinShare;

  // Draw probability follows a bell curve centred on evenness:
  //   even teams ~ 28% draw, decreasing to ~14% for blowouts.
  const closeness = Math.exp(-(diff * diff) / 200);
  const drawShareRaw = 0.14 + 0.14 * closeness + jitter * 0.6;
  const drawShare = Math.max(0.10, Math.min(0.30, drawShareRaw));

  const remaining = 1 - drawShare;
  return normalizeThreeBps(remaining * homeWinShare, drawShare, remaining * awayWinShare);
}

function normalizeThreeBps(homeProb: number, drawProb: number, awayProb: number): { homeBps: number; drawBps: number; awayBps: number } {
  const parts = [homeProb, drawProb, awayProb];
  const sum = parts.reduce((acc, p) => acc + p, 0) || 1;
  const bps = parts.map((p) => Math.round((p / sum) * 10000));
  const diff = 10000 - bps.reduce((acc, b) => acc + b, 0);
  bps[0] = (bps[0] ?? 0) + diff;
  return { homeBps: bps[0] ?? 0, drawBps: bps[1] ?? 0, awayBps: bps[2] ?? 0 };
}

function decimalFromBps(bps: number): number {
  if (bps <= 0) return 99;
  return Math.round((10000 / bps) * 100) / 100;
}

function providerOdds(input: { marketType: "match_winner" | "exact_score"; fixtureId: string; label: string; decimalOdds: number; impliedProbabilityBps: number }) {
  const providerOutcomeLabel = input.label.toLowerCase().replaceAll(" ", "_");
  return {
    source: "provider_a",
    providerMarketId: `provider_a:${input.marketType}:${input.fixtureId}`,
    providerOutcomeId: `provider_a:${input.marketType === "exact_score" ? "correct_score" : "moneyline"}:${providerOutcomeLabel}`,
    decimalOdds: input.decimalOdds,
    impliedProbabilityBps: input.impliedProbabilityBps,
    lastUpdatedAt: DEMO_ODDS_UPDATED_AT,
    status: "available" as const,
  };
}

export function buildMatchWinnerMarketDefinition(input: {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
}): CommercialMarketDefinition {
  const definition = getCommercialMarketType("match_winner");
  const labels = [input.homeTeam, "Draw", input.awayTeam];
  const { homeBps, drawBps, awayBps } = deriveMatchWinnerProbabilities(input);
  const probabilities = [homeBps, drawBps, awayBps];
  const decimalOddsForBps = probabilities.map((bps) => decimalFromBps(bps));
  return {
    id: `${input.fixtureId}:match_winner`,
    fixtureId: input.fixtureId,
    marketType: "match_winner",
    windowKey: `fixture:${input.fixtureId}:match_winner`,
    title: `${input.homeTeam} vs ${input.awayTeam}`,
    startMatchSecond: 0,
    endMatchSecond: 5400,
    tradingCloseMatchSecond: 5400,
    outcomes: labels.map((label, outcomeIndex) => ({
      outcomeIndex,
      label,
      probabilityBps: probabilities[outcomeIndex] ?? 0,
      providerOdds: providerOdds({ marketType: "match_winner", fixtureId: input.fixtureId, label, decimalOdds: decimalOddsForBps[outcomeIndex] ?? 1, impliedProbabilityBps: probabilities[outcomeIndex] ?? 0 }),
    })),
    resolutionPolicy: "full_time_match_winner_excluding_extra_time_and_penalties",
    resolutionRule: RESOLUTION_RULES.full_time_match_winner_excluding_extra_time_and_penalties,
    riskLevel: definition.riskLevel,
    chainCreationEnabled: definition.chainCreationEnabled,
    marketCategory: "core",
    displayPriority: 1,
    isFeatured: true,
    settlementRule: "90 minutes including stoppage time, excluding extra time and penalties.",
  };
}

const EXACT_SCORE_LABELS = ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2"] as const;
const BASE_EXPECTED_GOALS = 1.35;

function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i += 1) logP -= Math.log(i);
  return Math.exp(logP);
}

export function deriveExactScoreProbabilities(input: { fixtureId: string; homeTeam: string; awayTeam: string }): { labels: string[]; probabilitiesBps: number[] } {
  const jitter = (hashFixtureId(input.fixtureId) - 0.5) * 0.2;
  const diff = teamStrength(input.homeTeam) - teamStrength(input.awayTeam) + HOME_ADVANTAGE;
  const lambdaHome = Math.max(0.4, BASE_EXPECTED_GOALS * Math.exp(diff / 30) + jitter * 0.3);
  const lambdaAway = Math.max(0.4, BASE_EXPECTED_GOALS * Math.exp(-diff / 30) + jitter * 0.2);
  const cellProbs = EXACT_SCORE_LABELS.map((label) => {
    const [h, a] = label.split("-").map((n) => Number(n));
    return poissonPmf(lambdaHome, h ?? 0) * poissonPmf(lambdaAway, a ?? 0);
  });
  const sumKnown = cellProbs.reduce((acc, p) => acc + p, 0);
  const otherProb = Math.max(0.05, 1 - sumKnown);
  const all = [...cellProbs, otherProb];
  const total = all.reduce((acc, p) => acc + p, 0) || 1;
  const bps = all.map((p) => Math.round((p / total) * 10000));
  const diffBps = 10000 - bps.reduce((acc, b) => acc + b, 0);
  bps[bps.length - 1] = (bps[bps.length - 1] ?? 0) + diffBps;
  return { labels: [...EXACT_SCORE_LABELS, "Other score"], probabilitiesBps: bps };
}

export function buildExactScoreMarketDefinition(input: {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
}): CommercialMarketDefinition {
  const definition = getCommercialMarketType("exact_score");
  const { labels, probabilitiesBps } = deriveExactScoreProbabilities(input);
  return {
    id: `${input.fixtureId}:exact_score`,
    fixtureId: input.fixtureId,
    marketType: "exact_score",
    windowKey: `fixture:${input.fixtureId}:exact_score`,
    title: `${input.homeTeam} vs ${input.awayTeam} - Exact Score`,
    startMatchSecond: 0,
    endMatchSecond: 5400,
    tradingCloseMatchSecond: 5400,
    outcomes: labels.map((label, outcomeIndex) => {
      const bps = probabilitiesBps[outcomeIndex] ?? 0;
      const decimal = decimalFromBps(bps);
      return {
        outcomeIndex,
        label,
        probabilityBps: bps,
        providerOdds: providerOdds({ marketType: "exact_score", fixtureId: input.fixtureId, label, decimalOdds: decimal, impliedProbabilityBps: bps }),
      };
    }),
    resolutionPolicy: "full_time_exact_score_or_other_score",
    resolutionRule: RESOLUTION_RULES.full_time_exact_score_or_other_score,
    riskLevel: definition.riskLevel,
    chainCreationEnabled: definition.chainCreationEnabled,
    marketCategory: "score",
    displayPriority: 2,
    isFeatured: false,
    settlementRule: "Final score after 90 minutes including stoppage time. Scores outside listed outcomes settle as Other score.",
  };
}

export function evaluateRiskOrder(input: { userExposureRaw: string; marketVolumeRaw: string; orderAmountRaw: string; limits: RiskLimit }): RiskDecision {
  if (!input.limits.enabled) return { allowed: false, reason: "RISK_LIMIT_DISABLED" };
  const userExposureAfter = BigInt(input.userExposureRaw) + BigInt(input.orderAmountRaw);
  const marketVolumeAfter = BigInt(input.marketVolumeRaw) + BigInt(input.orderAmountRaw);
  const orderAmount = BigInt(input.orderAmountRaw);
  if (orderAmount > BigInt(input.limits.maxOrderAmountRaw)) return { allowed: false, reason: "ORDER_LIMIT_EXCEEDED" };
  if (userExposureAfter > BigInt(input.limits.maxUserExposureRaw)) return { allowed: false, reason: "USER_LIMIT_EXCEEDED" };
  if (marketVolumeAfter > BigInt(input.limits.maxMarketVolumeRaw)) return { allowed: false, reason: "MARKET_LIMIT_EXCEEDED" };
  return { allowed: true };
}

export function shouldAutoPauseForProviderHealth(checks: ProviderHealthCheck[]): boolean {
  return checks.some((check) => check.status === "down" || check.status === "mismatched" || check.status === "delayed" || check.lastUpdateAgeSeconds > 30);
}


export type CommercialResolutionInput = {
  marketType: CommercialMarketType;
  homeTeam: string;
  awayTeam: string;
  startMatchSecond: number;
  endMatchSecond: number;
  events: MatchEvent[];
  homeScore?: number;
  awayScore?: number;
  exactScoreOutcomes?: string[];
};

export type CommercialResolution = {
  winningOutcome: number;
  reason: "match_winner_home" | "match_winner_draw" | "match_winner_away" | "exact_score" | "other_score";
};

export function resolveCommercialMarketOutcome(input: CommercialResolutionInput): CommercialResolution {
  if (input.marketType === "match_winner") {
    const homeScore = input.homeScore ?? 0;
    const awayScore = input.awayScore ?? 0;
    if (homeScore > awayScore) return { winningOutcome: 0, reason: "match_winner_home" };
    if (homeScore < awayScore) return { winningOutcome: 2, reason: "match_winner_away" };
    return { winningOutcome: 1, reason: "match_winner_draw" };
  }
  if (input.marketType === "exact_score") {
    const homeScore = input.homeScore ?? 0;
    const awayScore = input.awayScore ?? 0;
    const scoreLabel = `${homeScore}-${awayScore}`;
    const labels = input.exactScoreOutcomes ?? ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2", "Other score"];
    const index = labels.indexOf(scoreLabel);
    return index >= 0 ? { winningOutcome: index, reason: "exact_score" } : { winningOutcome: labels.indexOf("Other score"), reason: "other_score" };
  }
  throw new Error(`Resolution is not enabled for ${input.marketType}`);
}
