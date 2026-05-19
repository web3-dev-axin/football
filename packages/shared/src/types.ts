export type OutcomeIndex = 0 | 1;

export const OUTCOME = {
  YES: 0,
  NO: 1,
} as const;

export type FixtureStatus = "scheduled" | "live" | "full_time" | "postponed" | "cancelled" | "abandoned" | "final";
export type DataQualityStatus = "pending" | "verified" | "data_review_required";
export type SourceName = "fifa_official" | "sports_data_provider";

export type LiveWindowStatus =
  | "scheduled"
  | "live_trading"
  | "closing_soon"
  | "closed"
  | "proposed"
  | "challenged"
  | "redeemable"
  | "settled"
  | "voided";

export type MarketStatus = LiveWindowStatus;
export type ProposalStatus = "proposed" | "challenged" | "finalized" | "voided";

export type AmountView = {
  raw: string;
  decimals: number;
  formatted: string;
};

export type Team = {
  id: string;
  name: string;
  fifaCode: string;
  confederation: string;
  qualifiedStatus: string;
};

export type Fixture = {
  id: string;
  fifaMatchId: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  status: FixtureStatus;
  homeScore: number;
  awayScore: number;
  matchSecond: number;
  displayClock: string;
  venue: string;
  kickoffAtUtc: string;
  dataQualityStatus: DataQualityStatus;
};

export type LiveWindow = {
  id: string;
  fixtureId: string;
  windowKey: string;
  windowType: "goal_in_next_10_minutes";
  startMatchSecond: number;
  endMatchSecond: number;
  tradingCloseMatchSecond: number;
  title: string;
  status: LiveWindowStatus;
  marketId?: string;
  dataQualityStatus: DataQualityStatus;
};

export type MarketOutcome = {
  outcomeIndex: OutcomeIndex;
  label: "Yes" | "No";
  probabilityBps: number;
  tokenId?: string;
};

export type Market = {
  id: string;
  liveWindowId: string;
  marketKey: string;
  title: string;
  status: MarketStatus;
  fixture: Fixture;
  liveWindow: LiveWindow;
  outcomes: MarketOutcome[];
  marketAddress?: `0x${string}`;
  txHash?: `0x${string}`;
  volumeRaw: string;
  liquidityRaw: string;
  oracleState: "none" | "proposed" | "challenged" | "finalized" | "voided";
  dataQualityStatus: DataQualityStatus;
};

export type MatchEvent = {
  id: string;
  fixtureId: string;
  providerEventId: string;
  eventType: "goal" | "goal_cancelled" | "var_review" | "half_start" | "half_end" | "full_time";
  team: string;
  matchMinute: number;
  matchSecond: number;
  isConfirmed: boolean;
  isCancelled: boolean;
  source: SourceName;
};

export type DataSourceSnapshot = {
  id: string;
  subjectKey: string;
  source: SourceName;
  payloadHash: string;
  payload: unknown;
  sourceTimestamp: string;
  ingestedAt: string;
};

export type DataMismatch = {
  field: string;
  officialValue: unknown;
  providerValue: unknown;
  severity: "warning" | "critical";
  action: "record_warning" | "block_market_creation" | "block_result_proposal";
};

export type DataComparison = {
  id: string;
  subjectType: "fixture" | "live_events" | "team";
  subjectKey: string;
  status: DataQualityStatus;
  criticalMismatchCount: number;
  warnings: DataMismatch[];
  mismatches: DataMismatch[];
};

export type ResultProposal = {
  id: string;
  marketId: string;
  winningOutcome: OutcomeIndex;
  goalCountInWindow: number;
  evidenceUri: string;
  challengeDeadline: string;
  status: ProposalStatus;
  txHash?: `0x${string}`;
};

export type Trade = {
  id: string;
  marketId: string;
  walletAddress: `0x${string}`;
  outcomeIndex: OutcomeIndex;
  collateralAmountRaw: string;
  sharesAmountRaw: string;
  tradeType: "buy" | "sell";
};

export type Redemption = {
  id: string;
  marketId: string;
  walletAddress: `0x${string}`;
  outcomeIndex: OutcomeIndex;
  sharesBurnedRaw: string;
  collateralPaidRaw: string;
};


export type CommercialMarketType =
  | "goal_window_5m"
  | "goal_window_10m"
  | "goal_window_15m"
  | "next_goal_team"
  | "half_remaining_goal"
  | "next_card_team"
  | "next_corner_team";

export type CommercialMarketRiskLevel = "low" | "medium" | "medium_high" | "high";

export type CommercialMarketTypeDefinition = {
  marketType: CommercialMarketType;
  label: string;
  outcomeLabels: string[];
  dataRequirements: string[];
  riskLevel: CommercialMarketRiskLevel;
  enabledByDefault: boolean;
  chainCreationEnabled: boolean;
};

export type CommercialMarketOutcome = {
  outcomeIndex: number;
  label: string;
  probabilityBps: number;
  tokenId?: string;
};

export type CommercialMarketDefinition = {
  id: string;
  fixtureId: string;
  marketType: CommercialMarketType;
  windowKey: string;
  title: string;
  startMatchSecond: number;
  endMatchSecond: number;
  tradingCloseMatchSecond: number;
  outcomes: CommercialMarketOutcome[];
  resolutionPolicy: string;
  riskLevel: CommercialMarketRiskLevel;
  chainCreationEnabled: boolean;
};

export type CommercialFeatureFlags = {
  enableRealCollateral: boolean;
  enableLiveGoalWindow: boolean;
  enableNextGoalMarket: boolean;
  enableCardMarket: boolean;
  enableCornerMarket: boolean;
  enablePublicChallenge: boolean;
  enableUmaAdapter: boolean;
  enableGeoBlock: boolean;
  enableTradingFees: boolean;
};

export type RiskLimitScope = "global" | "market" | "user" | "country";

export type RiskLimit = {
  scope: RiskLimitScope;
  subjectId: string;
  maxOrderAmountRaw: string;
  maxUserExposureRaw: string;
  maxMarketVolumeRaw: string;
  enabled: boolean;
};

export type RiskDecision = {
  allowed: boolean;
  reason?: "USER_LIMIT_EXCEEDED" | "MARKET_LIMIT_EXCEEDED" | "ORDER_LIMIT_EXCEEDED" | "RISK_LIMIT_DISABLED";
};

export type ProviderName = "fifa_official" | "provider_a" | "provider_b" | "sports_data_provider";
export type ProviderHealthStatus = "healthy" | "delayed" | "mismatched" | "down";

export type ProviderHealthCheck = {
  id: string;
  provider: ProviderName;
  status: ProviderHealthStatus;
  latencyMs: number;
  lastUpdateAgeSeconds: number;
  checkedAt: string;
  details: Record<string, unknown>;
};

export type OperatorActionType =
  | "feature_flag_updated"
  | "market_paused"
  | "market_resumed"
  | "market_voided"
  | "challenge_reviewed"
  | "risk_limit_updated"
  | "result_finalized";

export type OperatorAction = {
  id: string;
  operatorId: string;
  actionType: OperatorActionType;
  targetType: "market" | "fixture" | "feature_flag" | "risk_limit" | "challenge" | "result";
  targetId: string;
  reason: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MarketPause = {
  id: string;
  marketId: string;
  status: "active" | "resolved";
  reason: string;
  pausedBy: string;
  pausedAt: string;
  resolvedAt?: string;
};

export type LiquiditySnapshot = {
  id: string;
  marketId: string;
  liquidityRaw: string;
  volumeRaw: string;
  inventoryRiskBps: number;
  capturedAt: string;
};


export type ChallengeReviewStatus = "open" | "accepted" | "rejected";

export type Challenge = {
  id: string;
  resultProposalId: string;
  challengerAddress: `0x${string}`;
  reason: string;
  evidenceUri: string;
  bondAmountRaw: string;
  status: ChallengeReviewStatus;
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type RefundRequest = {
  id: string;
  marketId: string;
  walletAddress: `0x${string}`;
  status: "queued" | "processed";
  reason: string;
  createdAt: string;
};

export type IndexedBlock = {
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  indexedAt: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
