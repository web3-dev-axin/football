import type { Market, OutcomeIndex } from "@worldcup/shared";

export function quoteBuy(market: Market, outcomeIndex: OutcomeIndex, collateralAmountRaw: string) {
  const outcome = market.outcomes.find((candidate) => candidate.outcomeIndex === outcomeIndex);
  if (!outcome) throw new Error("Invalid outcome");
  return {
    outcome,
    sharesOutRaw: collateralAmountRaw,
    averagePriceBps: 10_000,
    potentialPayoutRaw: collateralAmountRaw,
  };
}
