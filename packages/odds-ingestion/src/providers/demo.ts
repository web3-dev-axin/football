import { buildDemoOddsSnapshots } from "../index";

export function fetchDemoOddsProvider(input: { marketId?: string; providerProbabilityBps?: number } = {}) {
  const [, provider] = buildDemoOddsSnapshots(input);
  return provider;
}
