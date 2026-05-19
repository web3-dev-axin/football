import { CHALLENGE_WINDOW_SECONDS, LIVE_WINDOW_CLOSE_BUFFER_SECONDS, LIVE_WINDOW_SECONDS } from "@worldcup/shared";

export const liveGoalMarketConfig = {
  windowSeconds: Number(process.env.LIVE_WINDOW_SECONDS ?? LIVE_WINDOW_SECONDS),
  closeBufferSeconds: Number(process.env.LIVE_WINDOW_CLOSE_BUFFER_SECONDS ?? LIVE_WINDOW_CLOSE_BUFFER_SECONDS),
  challengeWindowSeconds: Number(process.env.CHALLENGE_WINDOW_SECONDS ?? CHALLENGE_WINDOW_SECONDS),
  windowType: "goal_in_next_10_minutes",
} as const;
