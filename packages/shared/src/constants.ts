import type { Fixture, LiveWindow, MatchEvent, MarketOutcome, Team } from "./types";

export const DEMO_FIXTURE_ID = "demo-2026-001";
export const DEMO_LIVE_WINDOW_ID = "live-window-demo-63-73";
export const DEMO_MARKET_ID = "market-demo-63-73";
export const DEMO_MARKET_KEY = "fixture:demo-2026-001:goal_window:3780:4380";
export const USDC_DECIMALS = 6;
export const DEFAULT_CHAIN_ID = 31337;
export const LIVE_WINDOW_SECONDS = 600;
export const LIVE_WINDOW_CLOSE_BUFFER_SECONDS = 30;
export const CHALLENGE_WINDOW_SECONDS = 600;

export const DEMO_TEAMS: Team[] = [
  { id: "team-brazil", name: "Brazil", fifaCode: "BRA", confederation: "CONMEBOL", qualifiedStatus: "qualified" },
  { id: "team-morocco", name: "Morocco", fifaCode: "MAR", confederation: "CAF", qualifiedStatus: "qualified" },
];

export const DEMO_FIXTURE: Fixture = {
  id: DEMO_FIXTURE_ID,
  fifaMatchId: DEMO_FIXTURE_ID,
  matchNumber: 1,
  homeTeam: "Brazil",
  awayTeam: "Morocco",
  status: "live",
  homeScore: 0,
  awayScore: 0,
  matchSecond: 3780,
  displayClock: "63:00",
  venue: "New York New Jersey Stadium",
  kickoffAtUtc: "2026-06-13T21:00:00.000Z",
  dataQualityStatus: "verified",
};

export const DEMO_LIVE_WINDOW: LiveWindow = {
  id: DEMO_LIVE_WINDOW_ID,
  fixtureId: DEMO_FIXTURE_ID,
  windowKey: DEMO_MARKET_KEY,
  windowType: "goal_in_next_10_minutes",
  startMatchSecond: 3780,
  endMatchSecond: 4380,
  tradingCloseMatchSecond: 4350,
  title: "Brazil vs Morocco, 63:00-73:00 - will either team score a goal?",
  status: "live_trading",
  dataQualityStatus: "verified",
};

export const DEMO_OUTCOMES: MarketOutcome[] = [
  { outcomeIndex: 0, label: "Yes", probabilityBps: 5000 },
  { outcomeIndex: 1, label: "No", probabilityBps: 5000 },
];

export const DEMO_GOAL_EVENT: MatchEvent = {
  id: "event-demo-goal-001",
  fixtureId: DEMO_FIXTURE_ID,
  providerEventId: "demo-goal-001",
  eventType: "goal",
  team: "Brazil",
  matchMinute: 67,
  matchSecond: 4020,
  isConfirmed: true,
  isCancelled: false,
  source: "sports_data_provider",
};

export const DEMO_CANCELLED_GOAL_EVENT: MatchEvent = {
  id: "event-demo-goal-002",
  fixtureId: DEMO_FIXTURE_ID,
  providerEventId: "demo-goal-002",
  eventType: "goal_cancelled",
  team: "Brazil",
  matchMinute: 67,
  matchSecond: 4020,
  isConfirmed: true,
  isCancelled: true,
  source: "sports_data_provider",
};
