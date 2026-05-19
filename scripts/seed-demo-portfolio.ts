/**
 * Seed a large, realistic portfolio + settlement timeline for one demo wallet
 * via the admin endpoints. Targets the in-memory or Postgres-backed API.
 *
 * Usage:
 *   bun scripts/seed-demo-portfolio.ts --wallet=0xABC... [options]
 *
 * Options:
 *   --wallet=0x...           wallet to populate (required)
 *   --api-url=http://...     API base URL (default http://127.0.0.1:8787)
 *   --reset                  refuse to seed if any trades already exist for the wallet
 *   --buckets=live=20,...    override how many positions per bucket
 *   --seed=42                deterministic RNG seed (default 42)
 *
 * Bucket sizing defaults: live=20 awaiting=6 redeemable=5 voided=3 settled=10
 */

import type { CommercialMarketDefinition, Market, ResultProposal, Trade } from "@polygoal/shared";

type Bucket = "live" | "awaiting" | "redeemable" | "voided" | "settled";

type MarketStatusOverride =
  | "live_trading"
  | "closing_soon"
  | "scheduled"
  | "closed"
  | "proposed"
  | "challenged"
  | "redeemable"
  | "settled"
  | "voided";

type OracleStateOverride = "none" | "proposed" | "challenged" | "finalized" | "voided";

const ARGS = parseArgs(process.argv.slice(2));
const WALLET = (ARGS.wallet ?? "").trim() as `0x${string}`;
const API_URL = (ARGS["api-url"] ?? process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const RNG_SEED = Number.parseInt(ARGS.seed ?? "42", 10);
const RESET_GUARD = Boolean(ARGS.reset);

if (!/^0x[0-9a-fA-F]{40}$/.test(WALLET)) {
  console.error("usage: bun scripts/seed-demo-portfolio.ts --wallet=0x<40 hex chars> [--api-url=...]");
  process.exit(1);
}

const DEFAULT_BUCKETS: Record<Bucket, number> = {
  live: 20,
  awaiting: 6,
  redeemable: 5,
  voided: 3,
  settled: 10,
};

const BUCKET_SIZES = parseBuckets(ARGS.buckets, DEFAULT_BUCKETS);

// Each bucket needs concrete market.status + oracleState overrides so the
// PortfolioPageClient's groupPositions() lands the trade in the right group.
const BUCKET_OVERRIDES: Record<Bucket, { marketStatus: MarketStatusOverride; oracleState: OracleStateOverride; settlementStatus?: ResultProposal["status"] }> = {
  live: { marketStatus: "live_trading", oracleState: "none" },
  awaiting: { marketStatus: "closed", oracleState: "proposed", settlementStatus: "proposed" },
  redeemable: { marketStatus: "redeemable", oracleState: "finalized", settlementStatus: "finalized" },
  voided: { marketStatus: "voided", oracleState: "voided", settlementStatus: "voided" },
  settled: { marketStatus: "settled", oracleState: "finalized", settlementStatus: "finalized" },
};

main().catch((err) => {
  console.error("seed-demo-portfolio failed:", err);
  process.exit(1);
});

async function main() {
  console.log(`▶ seeding portfolio for ${WALLET}`);
  console.log(`  api=${API_URL}  seed=${RNG_SEED}  buckets=${JSON.stringify(BUCKET_SIZES)}\n`);

  const rng = mulberry32(RNG_SEED);

  const existing = await getPortfolio(WALLET);
  if (existing.positions.length > 0) {
    console.log(`⚠ wallet already has ${existing.positions.length} trades.`);
    if (RESET_GUARD) {
      console.error("--reset specified: refusing to seed on top of existing data");
      process.exit(2);
    }
    console.log("   continuing — new positions will be appended on top.\n");
  }

  const commercialMarkets = await listCommercialMarkets();
  console.log(`✓ fetched ${commercialMarkets.length} commercial markets from /commercial-markets`);

  // Prefer match_winner markets (3 outcomes, more visually interesting), but
  // also include some exact_score ones so the position list has variety.
  const matchWinner = shuffle(commercialMarkets.filter((m) => m.marketType === "match_winner"), rng);
  const exactScore = shuffle(commercialMarkets.filter((m) => m.marketType === "exact_score"), rng);
  const pool = interleave(matchWinner, exactScore);

  if (pool.length < totalBucketSize(BUCKET_SIZES)) {
    console.error(`not enough commercial markets (${pool.length}) for requested buckets (${totalBucketSize(BUCKET_SIZES)})`);
    process.exit(3);
  }

  const counters = { positions: 0, settlements: 0, errors: 0 };
  let cursor = 0;

  for (const bucket of Object.keys(BUCKET_SIZES) as Bucket[]) {
    const count = BUCKET_SIZES[bucket];
    if (count <= 0) continue;
    const slice = pool.slice(cursor, cursor + count);
    cursor += count;

    console.log(`\n— ${bucket.toUpperCase()} (${slice.length} positions) —`);
    for (const market of slice) {
      try {
        const result = await seedOne(market, bucket, rng);
        counters.positions += 1;
        if (result.settlement) counters.settlements += 1;
        console.log(`  ✓ ${bucket.padEnd(11)} ${market.id.padEnd(46)} outcome=${result.outcomeLabel.padEnd(18)} ${formatUsdc(result.collateralRaw)} USDC`);
      } catch (err) {
        counters.errors += 1;
        console.warn(`  ✗ ${bucket.padEnd(11)} ${market.id.padEnd(46)} ${(err as Error).message}`);
      }
    }
  }

  console.log("\n— SUMMARY —");
  console.log(`  positions inserted:    ${counters.positions}`);
  console.log(`  settlements upserted:  ${counters.settlements}`);
  console.log(`  errors:                ${counters.errors}`);
  console.log(`\nDone. Refresh ${API_URL.replace(/:\d+$/, "")} /portfolio and /settlements to see results.`);

  const final = await getPortfolio(WALLET);
  console.log(`/portfolio/${WALLET} now returns ${final.positions.length} positions.`);
  if (counters.errors > 0) process.exit(4);
}

async function seedOne(
  market: CommercialMarketDefinition,
  bucket: Bucket,
  rng: () => number,
): Promise<{ outcomeLabel: string; collateralRaw: string; settlement?: ResultProposal }> {
  const overrides = BUCKET_OVERRIDES[bucket];
  const outcomeIndex = pickOutcomeIndex(market, bucket, rng);
  const outcomeLabel = market.outcomes[outcomeIndex]?.label ?? `Outcome ${outcomeIndex}`;
  const collateralRaw = randomCollateral(bucket, rng);
  // For "voided" we explicitly want collateral preserved so refunds make sense;
  // for "redeemable" we use the same shares as collateral so 1 share = 1 USDC payout.
  const sharesAmountRaw = collateralRaw;

  await postJson<{ trade: Trade }>(`/admin/portfolio/seed-position`, {
    commercialMarketId: market.id,
    walletAddress: WALLET,
    outcomeIndex,
    collateralAmountRaw: collateralRaw,
    sharesAmountRaw,
    tradeType: "buy",
    marketStatusOverride: overrides.marketStatus,
    oracleStateOverride: overrides.oracleState,
  });

  // For non-live buckets, also publish a settlement proposal so /settlements
  // shows a corresponding entry tied to this fixture/outcome.
  let settlement: ResultProposal | undefined;
  if (overrides.settlementStatus) {
    // Pick a "winning outcome": for redeemable/settled prefer the wallet's
    // own outcome (so they actually won); for awaiting/voided rotate.
    const winningOutcome =
      bucket === "redeemable" || bucket === "settled"
        ? outcomeIndex
        : (outcomeIndex + 1) % market.outcomes.length;
    const evidenceUri = bucket === "voided"
      ? "" // voided -> no evidence needed
      : `https://www.fifa.com/fifaplus/en/match-centre/match/${encodeURIComponent(market.fixtureId)}`;
    const res = await postJson<{ proposal: ResultProposal }>(`/admin/results/seed-demo`, {
      commercialMarketId: market.id,
      winningOutcome,
      status: overrides.settlementStatus,
      evidenceUri,
      goalCountInWindow: market.marketType === "match_winner" ? Math.floor(rng() * 4) : 0,
    });
    settlement = res.proposal;
  }

  return { outcomeLabel, collateralRaw, settlement };
}

function pickOutcomeIndex(market: CommercialMarketDefinition, bucket: Bucket, rng: () => number): number {
  // Bias away from the draw / "other score" outcomes for match_winner / exact_score
  // so the demo portfolio looks like a confident bettor most of the time.
  const n = market.outcomes.length;
  if (market.marketType === "match_winner") {
    // 0=home, 1=draw, 2=away. Heavier weight on the favored side. Pick at random
    // but weight away from draw.
    const weights = [0.45, 0.15, 0.4];
    return weightedIndex(weights, rng) % n;
  }
  if (market.marketType === "exact_score") {
    // Favor low scoring lines: 0-0, 1-0, 0-1, 1-1
    const weights = [0.18, 0.22, 0.2, 0.18, 0.07, 0.05, 0.04, 0.03, 0.02, 0.01];
    return weightedIndex(weights.slice(0, n), rng);
  }
  return Math.floor(rng() * n);
}

function weightedIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((acc, w) => acc + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function randomCollateral(bucket: Bucket, rng: () => number): string {
  // Different buckets get different distributions to feel realistic.
  const usdc = (() => {
    switch (bucket) {
      case "live":       return 25 + Math.floor(rng() * 475); // 25 - 500
      case "awaiting":   return 50 + Math.floor(rng() * 450);
      case "redeemable": return 30 + Math.floor(rng() * 200);
      case "voided":     return 20 + Math.floor(rng() * 80);
      case "settled":    return 15 + Math.floor(rng() * 235);
    }
  })();
  // USDC has 6 decimals, but we sprinkle some sub-dollar precision too.
  const fractional = Math.floor(rng() * 1_000_000);
  return (BigInt(usdc) * 1_000_000n + BigInt(fractional)).toString();
}

async function listCommercialMarkets(): Promise<CommercialMarketDefinition[]> {
  const data = await getJson<{ commercialMarkets: CommercialMarketDefinition[] }>(`/commercial-markets`);
  return data.commercialMarkets;
}

async function getPortfolio(wallet: string): Promise<{ positions: Trade[]; summary: { positionCount: number } }> {
  return getJson(`/portfolio/${encodeURIComponent(wallet)}`);
}

async function getMarket(id: string): Promise<Market | undefined> {
  try {
    return await getJson<Market>(`/markets/${encodeURIComponent(id)}`);
  } catch {
    return undefined;
  }
}
// Re-export so TypeScript doesn't flag getMarket as unused in case future
// extensions of this script want to enrich logs. Touch-touch.
void getMarket;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${res.statusText} ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tok of argv) {
    if (!tok.startsWith("--")) continue;
    const eq = tok.indexOf("=");
    if (eq < 0) out[tok.slice(2)] = "true";
    else out[tok.slice(2, eq)] = tok.slice(eq + 1);
  }
  return out;
}

function parseBuckets(raw: string | undefined, defaults: Record<Bucket, number>): Record<Bucket, number> {
  if (!raw) return { ...defaults };
  const out = { ...defaults };
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=");
    if (!k || v === undefined) continue;
    if (!(k in defaults)) {
      console.warn(`unknown bucket "${k}" ignored`);
      continue;
    }
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) out[k as Bucket] = n;
  }
  return out;
}

function totalBucketSize(b: Record<Bucket, number>): number {
  return (Object.values(b) as number[]).reduce((acc, n) => acc + n, 0);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

// Tiny deterministic RNG (Mulberry32) so re-running produces the same demo state.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatUsdc(raw: string): string {
  const big = BigInt(raw);
  const whole = big / 1_000_000n;
  const frac = (big % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toString()}.${frac}`;
}
