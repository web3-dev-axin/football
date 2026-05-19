import type {
  CommercialFeatureFlags,
  CommercialMarketDefinition,
  CommercialMarketType,
  CommercialMarketTypeDefinition,
  ProviderHealthCheck,
  MatchEvent,
  RiskDecision,
  RiskLimit,
} from "./types";

export const COMMERCIAL_MARKET_TYPES: CommercialMarketTypeDefinition[] = [
  { marketType: "goal_window_5m", label: "Future 5 minutes goal", outcomeLabels: ["Yes", "No"], dataRequirements: ["live_clock", "goal_event"], riskLevel: "medium", enabledByDefault: true, chainCreationEnabled: true },
  { marketType: "goal_window_10m", label: "Future 10 minutes goal", outcomeLabels: ["Yes", "No"], dataRequirements: ["live_clock", "goal_event"], riskLevel: "medium", enabledByDefault: true, chainCreationEnabled: true },
  { marketType: "goal_window_15m", label: "Future 15 minutes goal", outcomeLabels: ["Yes", "No"], dataRequirements: ["live_clock", "goal_event"], riskLevel: "medium", enabledByDefault: true, chainCreationEnabled: true },
  { marketType: "next_goal_team", label: "Next goal team", outcomeLabels: ["Team A", "Team B", "No goal before full time"], dataRequirements: ["goal_event", "full_time"], riskLevel: "medium_high", enabledByDefault: true, chainCreationEnabled: false },
  { marketType: "half_remaining_goal", label: "Any goal this half", outcomeLabels: ["Yes", "No"], dataRequirements: ["period", "goal_event"], riskLevel: "medium", enabledByDefault: false, chainCreationEnabled: false },
  { marketType: "next_card_team", label: "Next card team", outcomeLabels: ["Team A", "Team B", "No card"], dataRequirements: ["card_event"], riskLevel: "high", enabledByDefault: false, chainCreationEnabled: false },
  { marketType: "next_corner_team", label: "Next corner team", outcomeLabels: ["Team A", "Team B", "No corner"], dataRequirements: ["corner_event"], riskLevel: "high", enabledByDefault: false, chainCreationEnabled: false },
];

export const DEFAULT_COMMERCIAL_FEATURE_FLAGS: CommercialFeatureFlags = {
  enableRealCollateral: false,
  enableLiveGoalWindow: true,
  enableNextGoalMarket: true,
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

export function buildGoalWindowMarketDefinition(input: {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  startMatchSecond: number;
  durationMinutes: 5 | 10 | 15;
}): CommercialMarketDefinition {
  const marketType = `goal_window_${input.durationMinutes}m` as CommercialMarketType;
  const definition = getCommercialMarketType(marketType);
  const durationSeconds = input.durationMinutes * 60;
  const endMatchSecond = input.startMatchSecond + durationSeconds;
  return {
    id: `${input.fixtureId}:${marketType}:${input.startMatchSecond}:${endMatchSecond}`,
    fixtureId: input.fixtureId,
    marketType,
    windowKey: `fixture:${input.fixtureId}:${marketType}:${input.startMatchSecond}:${endMatchSecond}`,
    title: `${input.homeTeam} vs ${input.awayTeam}, next ${input.durationMinutes} minutes - will either team score?`,
    startMatchSecond: input.startMatchSecond,
    endMatchSecond,
    tradingCloseMatchSecond: Math.max(input.startMatchSecond, endMatchSecond - 30),
    outcomes: definition.outcomeLabels.map((label, outcomeIndex) => ({ outcomeIndex, label, probabilityBps: 5000 })),
    resolutionPolicy: "confirmed_goal_in_window_excluding_cancelled_var",
    riskLevel: definition.riskLevel,
    chainCreationEnabled: definition.chainCreationEnabled,
  };
}

export function buildNextGoalMarketDefinition(input: {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  startMatchSecond: number;
  endMatchSecond: number;
}): CommercialMarketDefinition {
  const definition = getCommercialMarketType("next_goal_team");
  const labels = [input.homeTeam, input.awayTeam, "No goal before full time"];
  return {
    id: `${input.fixtureId}:next_goal_team:${input.startMatchSecond}:${input.endMatchSecond}`,
    fixtureId: input.fixtureId,
    marketType: "next_goal_team",
    windowKey: `fixture:${input.fixtureId}:next_goal_team:${input.startMatchSecond}:${input.endMatchSecond}`,
    title: `${input.homeTeam} vs ${input.awayTeam} - who scores the next goal?`,
    startMatchSecond: input.startMatchSecond,
    endMatchSecond: input.endMatchSecond,
    tradingCloseMatchSecond: input.endMatchSecond,
    outcomes: labels.map((label, outcomeIndex) => ({ outcomeIndex, label, probabilityBps: outcomeIndex === 2 ? 3000 : 3500 })),
    resolutionPolicy: "next_confirmed_goal_team_or_no_goal_before_full_time",
    riskLevel: definition.riskLevel,
    chainCreationEnabled: false,
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
};

export type CommercialResolution = {
  winningOutcome: number;
  reason: "goal_in_window" | "no_goal_in_window" | "next_goal_home" | "next_goal_away" | "no_goal_before_full_time";
};

function confirmedGoalEvents(input: CommercialResolutionInput): MatchEvent[] {
  return input.events
    .filter((event) => event.eventType === "goal" && event.isConfirmed && !event.isCancelled)
    .filter((event) => event.matchSecond >= input.startMatchSecond && event.matchSecond <= input.endMatchSecond)
    .sort((left, right) => left.matchSecond - right.matchSecond);
}

export function resolveCommercialMarketOutcome(input: CommercialResolutionInput): CommercialResolution {
  const goals = confirmedGoalEvents(input);
  if (input.marketType === "next_goal_team") {
    const firstGoal = goals[0];
    if (!firstGoal) return { winningOutcome: 2, reason: "no_goal_before_full_time" };
    return firstGoal.team === input.homeTeam ? { winningOutcome: 0, reason: "next_goal_home" } : { winningOutcome: 1, reason: "next_goal_away" };
  }
  if (input.marketType === "goal_window_5m" || input.marketType === "goal_window_10m" || input.marketType === "goal_window_15m") {
    return goals.length > 0 ? { winningOutcome: 0, reason: "goal_in_window" } : { winningOutcome: 1, reason: "no_goal_in_window" };
  }
  throw new Error(`Resolution is not enabled for ${input.marketType}`);
}
