/**
 * Drive REAL on-chain trades + settlements on X Layer testnet so a single wallet
 * accumulates positions in every portfolio bucket (Live / Awaiting / Redeemable /
 * Voided / Settled). Unlike `seed-demo-portfolio.ts` (which writes only to the
 * API's in-memory + Postgres trade table), this script:
 *
 *   1. mints MockUSDC to the wallet
 *   2. approves + buys outcome shares on multiple deployed markets
 *   3. uses oracle adminResolve / voidMarket to push each market into the
 *      target end state (Redeemable when the wallet picked the winning side,
 *      Settled when it picked a losing side, Voided when the market is voided)
 *
 * Once the Ponder indexer catches up, the API's portfolio endpoint returns
 * these positions and the UI populates the corresponding buckets.
 *
 * Usage:
 *   bun scripts/seed-onchain-portfolio.ts [options]
 *
 *   --wallet=0x...          override target wallet (default: deploy account)
 *   --rpc-url=...           override RPC (default: env RPC_URL or deployments file)
 *   --private-key=...       override signer key (default: env PRIVATE_KEY)
 *   --buckets=live=4,...    override how many NEW markets per bucket
 *   --usdc-per-trade=25     USDC (whole units) per buy (default 25)
 *   --seed=42               deterministic RNG seed
 *   --dry-run               print planned actions, send no tx
 *
 * Bucket defaults: live=4 awaiting=2 redeemable=4 settled=4 voided=3
 *
 * "awaiting" leaves the market in the "ResultProposed" state without resolving
 * it (so it waits for finalize). For X Layer testnet this requires the wallet
 * to be the oracle's owner.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  toHex,
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

type Bucket = "live" | "awaiting" | "redeemable" | "settled" | "voided";

type DeployedMarket = {
  marketKey: string;
  fixtureId: string;
  fifaMatchId: string;
  matchNumber: number;
  marketType: "match_winner" | "exact_score";
  outcomeCount: number;
  homeTeam: string;
  awayTeam: string;
  marketAddress: Address;
  marketId: Hex;
};

type Deployments = {
  network: { chainId: number; rpcUrl: string };
  infra: { mockUsdc: Address; oracle: Address; ctf: Address; marketFactory: Address };
  markets: Record<string, DeployedMarket & { closeTimeUnix?: number }>;
};

const DEPLOYMENTS_PATH = "deployments/xlayer-testnet.json";

const ARGS = parseArgs(process.argv.slice(2));
const RNG_SEED = Number.parseInt(ARGS.seed ?? "42", 10);
const DRY_RUN = Boolean(ARGS["dry-run"]);
const USDC_PER_TRADE = BigInt(Number.parseInt(ARGS["usdc-per-trade"] ?? "25", 10)) * 1_000_000n;

const DEFAULT_BUCKETS: Record<Bucket, number> = {
  live: 4,
  awaiting: 2,
  redeemable: 4,
  settled: 4,
  voided: 3,
};

const BUCKET_SIZES = parseBuckets(ARGS.buckets, DEFAULT_BUCKETS);

main().catch((err) => {
  console.error("seed-onchain-portfolio failed:", err);
  process.exit(1);
});

async function main() {
  const deployments = readDeployments();
  const rpcUrl = ARGS["rpc-url"] ?? process.env.RPC_URL ?? deployments.network.rpcUrl;
  const privateKey = (ARGS["private-key"] ?? process.env.PRIVATE_KEY ?? "").trim();
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("PRIVATE_KEY is required (set in .env or pass --private-key=0x...)");
  }
  const account = privateKeyToAccount(privateKey as Hex);
  const targetWallet = (ARGS.wallet ?? account.address) as Address;
  if (targetWallet.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `--wallet ${targetWallet} differs from the signer address ${account.address}. ` +
        "This script can only seed positions for the wallet that signs the transactions.",
    );
  }

  const chain = defineChain({
    id: deployments.network.chainId,
    name: deployments.network.name ?? "X Layer Testnet",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  } satisfies Chain);

  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const walletClient = createWalletClient({ account, chain, transport });

  const usdcAbi = loadAbi("MockUSDC");
  const marketAbi = loadAbi("WorldCupMarket");
  const oracleAbi = loadAbi("OptimisticResultOracle");

  console.log(`▶ on-chain portfolio seeding`);
  console.log(`  wallet:  ${account.address}`);
  console.log(`  rpc:     ${rpcUrl}`);
  console.log(`  chain:   ${chain.id}`);
  console.log(`  usdc/tx: ${USDC_PER_TRADE / 1_000_000n} USDC`);
  console.log(`  buckets: ${JSON.stringify(BUCKET_SIZES)}`);
  console.log(`  dry-run: ${DRY_RUN}\n`);

  // 1. Pick fresh markets we haven't traded on yet (avoid double-tapping the
  //    already-populated ones). We only consider markets whose status on-chain
  //    is still LiveTrading (status==0) and which haven't been resolved.
  // The deployments file stores marketKey as the object key, not as a property,
  // so hydrate it in here.
  const allMarkets = Object.entries(deployments.markets)
    .map(([key, value]) => ({ ...value, marketKey: value.marketKey ?? key }))
    .filter((m) => m.marketType === "match_winner");
  const candidateStatuses = await Promise.all(
    allMarkets.map((m) => readMarketStatus(publicClient, marketAbi, m.marketAddress)),
  );
  const candidates = allMarkets.filter((_, i) => candidateStatuses[i] === 0); // LiveTrading
  console.log(`✓ ${candidates.length} markets are still LiveTrading on-chain (of ${allMarkets.length})\n`);

  // Shuffle deterministically.
  const rng = mulberry32(RNG_SEED);
  const pool = shuffle(candidates, rng);

  // 2. Pre-mint USDC if balance is low.
  const totalNeeded = USDC_PER_TRADE * BigInt(totalBucketSize(BUCKET_SIZES));
  const balance = (await publicClient.readContract({
    address: deployments.infra.mockUsdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  console.log(`  current MockUSDC balance: ${formatUsdc(balance)} USDC`);
  if (balance < totalNeeded) {
    const toMint = totalNeeded - balance + 1_000_000n * 100n; // small buffer
    console.log(`  minting ${formatUsdc(toMint)} additional USDC...`);
    if (!DRY_RUN) {
      const hash = await walletClient.writeContract({
        address: deployments.infra.mockUsdc,
        abi: usdcAbi,
        functionName: "mint",
        args: [account.address, toMint],
        account,
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ✓ mint tx ${hash}\n`);
    } else {
      console.log(`  (dry-run, skipping mint)\n`);
    }
  } else {
    console.log(`  balance is sufficient — skipping mint\n`);
  }

  // 3. Iterate buckets.
  let cursor = 0;
  const summary = {
    bought: 0,
    proposed: 0,
    finalized: 0,
    voided: 0,
    skipped: 0,
    failed: 0,
  };
  for (const bucket of Object.keys(BUCKET_SIZES) as Bucket[]) {
    const count = BUCKET_SIZES[bucket];
    if (count <= 0) continue;
    const batch = pool.slice(cursor, cursor + count);
    cursor += count;
    console.log(`\n— ${bucket.toUpperCase()} (${batch.length} markets) —`);

    for (const market of batch) {
      try {
        const result = await seedOne({
          bucket,
          market,
          account,
          publicClient,
          walletClient,
          chain,
          deployments,
          usdcAbi,
          marketAbi,
          oracleAbi,
          rng,
        });
        summary.bought += result.bought ? 1 : 0;
        summary.proposed += result.proposed ? 1 : 0;
        summary.finalized += result.finalized ? 1 : 0;
        summary.voided += result.voided ? 1 : 0;
        console.log(`  ✓ ${bucket.padEnd(11)} ${market.marketKey} outcome=${result.outcomeIndex} (${result.outcomeLabel})`);
      } catch (err) {
        summary.failed += 1;
        console.warn(`  ✗ ${bucket.padEnd(11)} ${market.marketKey} ${(err as Error).message?.slice(0, 200)}`);
      }
    }
  }

  console.log(`\n— SUMMARY —`);
  console.log(`  buys (TradeExecuted):  ${summary.bought}`);
  console.log(`  proposals (oracle):    ${summary.proposed}`);
  console.log(`  finalize (adminResolve): ${summary.finalized}`);
  console.log(`  voids (voidMarket):    ${summary.voided}`);
  console.log(`  failed:                ${summary.failed}`);
  console.log(`\nGive Ponder ~30s to index, then refresh /portfolio.`);
}

type SeedDeps = {
  bucket: Bucket;
  market: DeployedMarket;
  account: Account;
  publicClient: PublicClient;
  walletClient: WalletClient;
  chain: Chain;
  deployments: Deployments;
  usdcAbi: Abi;
  marketAbi: Abi;
  oracleAbi: Abi;
  rng: () => number;
};

async function seedOne(deps: SeedDeps): Promise<{
  outcomeIndex: number;
  outcomeLabel: string;
  bought: boolean;
  proposed: boolean;
  finalized: boolean;
  voided: boolean;
}> {
  const labels = matchWinnerLabels(deps.market);
  // Outcome the wallet trades on. Random across [0, outcomeCount).
  const outcomeIndex = Math.floor(deps.rng() * deps.market.outcomeCount);
  const outcomeLabel = labels[outcomeIndex] ?? `Outcome ${outcomeIndex}`;

  if (DRY_RUN) {
    return { outcomeIndex, outcomeLabel, bought: false, proposed: false, finalized: false, voided: false };
  }

  // Phase 1: ensure allowance and BUY.
  await ensureApproval(deps, USDC_PER_TRADE);
  const buyHash = await deps.walletClient.writeContract({
    address: deps.market.marketAddress,
    abi: deps.marketAbi,
    functionName: "buy",
    args: [BigInt(outcomeIndex), USDC_PER_TRADE, USDC_PER_TRADE],
    account: deps.account,
    chain: deps.chain,
  });
  await deps.publicClient.waitForTransactionReceipt({ hash: buyHash });

  // Phase 2: drive market into target end state.
  let proposed = false;
  let finalized = false;
  let voided = false;

  switch (deps.bucket) {
    case "live":
      break;
    case "voided": {
      const voidHash = await deps.walletClient.writeContract({
        address: deps.deployments.infra.oracle,
        abi: deps.oracleAbi,
        functionName: "voidMarket",
        args: [deps.market.marketAddress, deps.market.marketId],
        account: deps.account,
        chain: deps.chain,
      });
      await deps.publicClient.waitForTransactionReceipt({ hash: voidHash });
      voided = true;
      break;
    }
    case "awaiting": {
      // Propose but don't finalize — challenge window left open so the UI shows
      // it under "Awaiting / settling".
      const propHash = await proposeResultTx(deps, outcomeIndex);
      await deps.publicClient.waitForTransactionReceipt({ hash: propHash });
      proposed = true;
      break;
    }
    case "redeemable": {
      // Propose with the same outcome the wallet bought, then adminResolve to
      // skip the challenge window. Wallet ends up with winning shares.
      const propHash = await proposeResultTx(deps, outcomeIndex);
      await deps.publicClient.waitForTransactionReceipt({ hash: propHash });
      proposed = true;
      const adminHash = await deps.walletClient.writeContract({
        address: deps.deployments.infra.oracle,
        abi: deps.oracleAbi,
        functionName: "adminResolve",
        args: [deps.market.marketId, outcomeIndex],
        account: deps.account,
        chain: deps.chain,
      });
      await deps.publicClient.waitForTransactionReceipt({ hash: adminHash });
      finalized = true;
      break;
    }
    case "settled": {
      // Propose + adminResolve with a DIFFERENT outcome so the wallet loses
      // and the position lands in the Settled (history) bucket.
      const losingOutcome = (outcomeIndex + 1) % deps.market.outcomeCount;
      const propHash = await proposeResultTx(deps, losingOutcome);
      await deps.publicClient.waitForTransactionReceipt({ hash: propHash });
      proposed = true;
      const adminHash = await deps.walletClient.writeContract({
        address: deps.deployments.infra.oracle,
        abi: deps.oracleAbi,
        functionName: "adminResolve",
        args: [deps.market.marketId, losingOutcome],
        account: deps.account,
        chain: deps.chain,
      });
      await deps.publicClient.waitForTransactionReceipt({ hash: adminHash });
      finalized = true;
      break;
    }
  }

  return { outcomeIndex, outcomeLabel, bought: true, proposed, finalized, voided };
}

async function proposeResultTx(deps: SeedDeps, winningOutcome: number): Promise<Hex> {
  return deps.walletClient.writeContract({
    address: deps.deployments.infra.oracle,
    abi: deps.oracleAbi,
    functionName: "proposeResult",
    args: [
      deps.market.marketAddress,
      {
        marketId: deps.market.marketId,
        winningOutcome,
        homeScore: 1,
        awayScore: 0,
        dataSourceHash: keccak256(toHex(`seed-onchain-portfolio:${deps.market.marketKey}`)),
        evidenceUri: `https://www.fifa.com/fifaplus/en/match-centre/match/${deps.market.fifaMatchId}`,
      },
    ],
    account: deps.account,
    chain: deps.chain,
  });
}

async function ensureApproval(deps: SeedDeps, needed: bigint): Promise<void> {
  const allowance = (await deps.publicClient.readContract({
    address: deps.deployments.infra.mockUsdc,
    abi: deps.usdcAbi,
    functionName: "allowance",
    args: [deps.account.address, deps.market.marketAddress],
  })) as bigint;
  if (allowance >= needed) return;
  const approveHash = await deps.walletClient.writeContract({
    address: deps.deployments.infra.mockUsdc,
    abi: deps.usdcAbi,
    functionName: "approve",
    args: [deps.market.marketAddress, needed * 4n], // generous so we don't re-approve every time
    account: deps.account,
    chain: deps.chain,
  });
  await deps.publicClient.waitForTransactionReceipt({ hash: approveHash });
}

async function readMarketStatus(publicClient: PublicClient, marketAbi: Abi, market: Address): Promise<number> {
  try {
    const status = (await publicClient.readContract({
      address: market,
      abi: marketAbi,
      functionName: "status",
    })) as number;
    return Number(status);
  } catch {
    return -1;
  }
}

function matchWinnerLabels(market: DeployedMarket): string[] {
  if (market.marketType !== "match_winner") return [];
  return [market.homeTeam, "Draw", market.awayTeam];
}

function readDeployments(): Deployments {
  if (!existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(`Missing ${DEPLOYMENTS_PATH}. Deploy infra+markets first with bun run deploy:xlayer:infra && bun run deploy:xlayer:markets`);
  }
  const raw = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"));
  return raw as Deployments;
}

function loadAbi(name: string): Abi {
  const path = `contracts/out/${name}.sol/${name}.json`;
  if (!existsSync(path)) throw new Error(`Missing artifact ${path}. Run forge build --root contracts.`);
  const artifact = JSON.parse(readFileSync(path, "utf8")) as { abi: Abi };
  return artifact.abi;
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
    if (!(k in defaults)) continue;
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

function formatUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = (raw % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toString()}.${frac}`;
}
