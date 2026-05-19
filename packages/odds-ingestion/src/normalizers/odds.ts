import type { OddsSnapshot } from "../index";

export function normalizeOddsProbabilities(snapshot: OddsSnapshot): number[] {
  const total = snapshot.outcomeProbabilitiesBps.reduce((sum, probability) => sum + probability, 0);
  if (total <= 0) return snapshot.outcomeProbabilitiesBps;
  const exact = snapshot.outcomeProbabilitiesBps.map((probability) => (probability / total) * 10_000);
  const rounded = exact.map(Math.floor);
  let remainder = 10_000 - rounded.reduce((sum, probability) => sum + probability, 0);
  const fractionalOrder = exact
    .map((probability, index) => ({ index, fraction: probability - Math.floor(probability) }))
    .sort((left, right) => right.fraction - left.fraction);
  for (const { index } of fractionalOrder) {
    if (remainder <= 0) break;
    rounded[index] += 1;
    remainder -= 1;
  }
  return rounded;
}
