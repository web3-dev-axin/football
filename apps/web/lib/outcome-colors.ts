import type { CSSProperties } from "react";
import type { CommercialMarketType } from "@polygoal/shared";

const MATCH_WINNER_COLORS: Record<number, string> = {
  0: "#06a14a",
  1: "#c47a04",
  2: "#3a6fd6",
};

const FALLBACK_PALETTE = [
  "#06a14a",
  "#c47a04",
  "#3a6fd6",
  "#b3406b",
  "#7a40b3",
  "#0d8bb8",
  "#a16207",
  "#15803d",
  "#7c2d12",
  "#475569",
];

export function colorForOutcome(marketType: CommercialMarketType | string | undefined, outcomeIndex: number, outcomeCount = 3): string {
  if (marketType === "match_winner" || outcomeCount === 3) {
    return MATCH_WINNER_COLORS[outcomeIndex] ?? FALLBACK_PALETTE[outcomeIndex % FALLBACK_PALETTE.length] ?? "#06a14a";
  }
  return FALLBACK_PALETTE[outcomeIndex % FALLBACK_PALETTE.length] ?? "#06a14a";
}

export function outcomeBarStyle(marketType: CommercialMarketType | string | undefined, outcomeIndex: number, probabilityBps: number, outcomeCount = 3): CSSProperties {
  const color = colorForOutcome(marketType, outcomeIndex, outcomeCount);
  const width = `${Math.max(2, Math.min(100, probabilityBps / 100))}%`;
  return {
    "--bar-color": color,
    "--bar-width": width,
  } as CSSProperties;
}
