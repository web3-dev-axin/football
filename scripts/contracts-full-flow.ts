import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const DEFAULT_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const USDC_100 = 100_000_000n;
const USDC_50 = 50_000_000n;

type Artifact = {
  abi: Abi;
  bytecode: { object: Hex } | Hex;
};

type CliOptions = {
  rpcUrl: string;
  privateKey: Hex;
  startAnvil: boolean;
  keepAnvil: boolean;
};

type Contracts = {
  usdc: Address;
  ctf: Address;
  oracle: Address;
  factory: Address;
};

type ScenarioReport = {
  market: Address;
  marketId: Hex;
  conditionId: Hex;
  txHashes: Record<string, Hex>;
  balances: Record<string, string>;
  status: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
    privateKey: (process.env.PRIVATE_KEY as Hex | undefined) ?? DEFAULT_PRIVATE_KEY,
    startAnvil: true,
    keepAnvil: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--rpc-url") options.rpcUrl = argv[++i] ?? options.rpcUrl;
    else if (arg === "--private-key") options.privateKey = argv[++i] as Hex;
    else if (arg === "--no-start-anvil") options.startAnvil = false;
    else if (arg === "--keep-anvil") options.keepAnvil = true;
  }
  return options;
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

async function rpcReady(rpcUrl: string): Promise<boolean> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureAnvil(options: CliOptions): Promise<{ started: boolean; stop: () => void }> {
  if (await rpcReady(options.rpcUrl)) return { started: false, stop: () => undefined };
  if (!options.startAnvil) throw new Error(`RPC is not reachable at ${options.rpcUrl}. Start Anvil or omit --no-start-anvil.`);

  const url = new URL(options.rpcUrl);
  const port = url.port || "8545";
  const child = Bun.spawn(["anvil", "--chain-id", "31337", "--host", "127.0.0.1", "--port", port], {
    stdout: "pipe",
    stderr: "pipe",
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await rpcReady(options.rpcUrl)) {
      return {
        started: true,
        stop: () => {
          if (!options.keepAnvil) child.kill();
        },
      };
    }
    await Bun.sleep(250);
  }
  child.kill();
  throw new Error("Timed out waiting for Anvil to start");
}

function artifact(name: string): Artifact {
  const path = `contracts/out/${name}.sol/${name}.json`;
  if (!existsSync(path)) throw new Error(`Missing artifact ${path}. Run forge build first.`);
  return JSON.parse(readFileSync(path, "utf8")) as Artifact;
}

function bytecodeOf(compiled: Artifact): Hex {
  return typeof compiled.bytecode === "string" ? compiled.bytecode : compiled.bytecode.object;
}

function statusLabel(status: bigint): string {
  return ["LiveTrading", "Closed", "ResultProposed", "Challenged", "Redeemable", "Voided"][Number(status)] ?? `Unknown(${status})`;
}

async function minePastChallengeWindow(publicClient: ReturnType<typeof createPublicClient>) {
  await publicClient.request({ method: "evm_increaseTime", params: [601] } as never);
  await publicClient.request({ method: "evm_mine", params: [] } as never);
}

async function wait(publicClient: ReturnType<typeof createPublicClient>, hash: Hex) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function deployAll(options: CliOptions) {
  run("forge", ["build", "--root", "contracts"]);

  const account = privateKeyToAccount(options.privateKey);
  const transport = http(options.rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport });
  const walletClient = createWalletClient({ account, chain: foundry, transport });

  const MockUSDC = artifact("MockUSDC");
  const ConditionalTokensLite = artifact("ConditionalTokensLite");
  const OptimisticResultOracle = artifact("OptimisticResultOracle");
  const WorldCupMarketFactory = artifact("WorldCupMarketFactory");
  const WorldCupMarket = artifact("WorldCupMarket");

  const deployTxs: Record<string, Hex> = {};
  const usdcHash = await walletClient.deployContract({ abi: MockUSDC.abi, bytecode: bytecodeOf(MockUSDC) });
  deployTxs.usdc = usdcHash;
  const usdcReceipt = await wait(publicClient, usdcHash);
  const usdc = usdcReceipt.contractAddress!;

  const ctfHash = await walletClient.deployContract({ abi: ConditionalTokensLite.abi, bytecode: bytecodeOf(ConditionalTokensLite) });
  deployTxs.ctf = ctfHash;
  const ctfReceipt = await wait(publicClient, ctfHash);
  const ctf = ctfReceipt.contractAddress!;

  const oracleHash = await walletClient.deployContract({ abi: OptimisticResultOracle.abi, bytecode: bytecodeOf(OptimisticResultOracle), args: [600n] });
  deployTxs.oracle = oracleHash;
  const oracleReceipt = await wait(publicClient, oracleHash);
  const oracle = oracleReceipt.contractAddress!;

  const factoryHash = await walletClient.deployContract({ abi: WorldCupMarketFactory.abi, bytecode: bytecodeOf(WorldCupMarketFactory), args: [usdc, ctf, oracle] });
  deployTxs.factory = factoryHash;
  const factoryReceipt = await wait(publicClient, factoryHash);
  const factory = factoryReceipt.contractAddress!;

  const transferOwnerHash = await walletClient.writeContract({ address: ctf, abi: ConditionalTokensLite.abi, functionName: "transferOwnership", args: [factory] });
  deployTxs.transferCtfOwnership = transferOwnerHash;
  await wait(publicClient, transferOwnerHash);

  return {
    account,
    publicClient,
    walletClient,
    artifacts: { MockUSDC, ConditionalTokensLite, OptimisticResultOracle, WorldCupMarketFactory, WorldCupMarket },
    contracts: { usdc, ctf, oracle, factory } satisfies Contracts,
    deployTxs,
  };
}

async function createMarket(ctx: Awaited<ReturnType<typeof deployAll>>, scenario: string) {
  const block = await ctx.publicClient.getBlock();
  const closeTime = block.timestamp + 300n;
  const marketKey = `fixture:demo-2026-001:goal_window:3780:4380:${scenario}:${Date.now()}`;
  const hash = await ctx.walletClient.writeContract({
    address: ctx.contracts.factory,
    abi: ctx.artifacts.WorldCupMarketFactory.abi,
    functionName: "createMarket",
    args: [marketKey, "demo-2026-001", 3780n, 4380n, closeTime, keccak256(toHex("goal-in-window")), 2n],
  });
  const receipt = await wait(ctx.publicClient, hash);
  const [event] = parseEventLogs({ abi: ctx.artifacts.WorldCupMarketFactory.abi, eventName: "MarketCreated", logs: receipt.logs }) as Array<{
    args: { marketId: Hex; market: Address; conditionId: Hex };
  }>;
  return { hash, market: event.args.market, marketId: event.args.marketId, conditionId: event.args.conditionId };
}

async function mintApproveBuy(ctx: Awaited<ReturnType<typeof deployAll>>, market: Address, outcomeIndex: bigint, amount: bigint) {
  const mint = await ctx.walletClient.writeContract({ address: ctx.contracts.usdc, abi: ctx.artifacts.MockUSDC.abi, functionName: "mint", args: [ctx.account.address, amount] });
  await wait(ctx.publicClient, mint);
  const approve = await ctx.walletClient.writeContract({ address: ctx.contracts.usdc, abi: ctx.artifacts.MockUSDC.abi, functionName: "approve", args: [market, amount] });
  await wait(ctx.publicClient, approve);
  const buy = await ctx.walletClient.writeContract({ address: market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "buy", args: [outcomeIndex, amount, amount] });
  await wait(ctx.publicClient, buy);
  return { mint, approve, buy };
}

async function positionBalance(ctx: Awaited<ReturnType<typeof deployAll>>, conditionId: Hex, outcomeIndex: bigint): Promise<bigint> {
  const positionId = await ctx.publicClient.readContract({ address: ctx.contracts.ctf, abi: ctx.artifacts.ConditionalTokensLite.abi, functionName: "getPositionId", args: [conditionId, outcomeIndex] }) as bigint;
  return ctx.publicClient.readContract({ address: ctx.contracts.ctf, abi: ctx.artifacts.ConditionalTokensLite.abi, functionName: "balanceOf", args: [positionId, ctx.account.address] }) as Promise<bigint>;
}

async function happyFinalizeRedeem(ctx: Awaited<ReturnType<typeof deployAll>>): Promise<ScenarioReport> {
  const created = await createMarket(ctx, "happy");
  const yes = await mintApproveBuy(ctx, created.market, 0n, USDC_100);
  const no = await mintApproveBuy(ctx, created.market, 1n, USDC_50);
  const propose = await ctx.walletClient.writeContract({
    address: ctx.contracts.oracle,
    abi: ctx.artifacts.OptimisticResultOracle.abi,
    functionName: "proposeResult",
    args: [created.market, { marketId: created.marketId, winningOutcome: 0, homeScore: 1, awayScore: 0, dataSourceHash: keccak256(toHex("demo-events")), evidenceUri: "demo://contracts/full-flow/happy" }],
  });
  await wait(ctx.publicClient, propose);
  await minePastChallengeWindow(ctx.publicClient);
  const finalize = await ctx.walletClient.writeContract({ address: ctx.contracts.oracle, abi: ctx.artifacts.OptimisticResultOracle.abi, functionName: "finalize", args: [created.marketId] });
  await wait(ctx.publicClient, finalize);
  const yesShares = await positionBalance(ctx, created.conditionId, 0n);
  const noShares = await positionBalance(ctx, created.conditionId, 1n);
  const redeemYes = await ctx.walletClient.writeContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "redeem", args: [0n, yesShares] });
  await wait(ctx.publicClient, redeemYes);
  const redeemNo = await ctx.walletClient.writeContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "redeem", args: [1n, noShares] });
  await wait(ctx.publicClient, redeemNo);
  const status = await ctx.publicClient.readContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "status" }) as bigint;
  const usdcBalance = await ctx.publicClient.readContract({ address: ctx.contracts.usdc, abi: ctx.artifacts.MockUSDC.abi, functionName: "balanceOf", args: [ctx.account.address] }) as bigint;
  return {
    market: created.market,
    marketId: created.marketId,
    conditionId: created.conditionId,
    txHashes: { createMarket: created.hash, buyYes: yes.buy, buyNo: no.buy, propose, finalize, redeemYes, redeemNo },
    balances: { accountUsdc: usdcBalance.toString(), yesSharesRedeemed: yesShares.toString(), noSharesRedeemed: noShares.toString() },
    status: statusLabel(status),
  };
}

async function challengedAdminResolve(ctx: Awaited<ReturnType<typeof deployAll>>): Promise<ScenarioReport> {
  const created = await createMarket(ctx, "challenged");
  const yes = await mintApproveBuy(ctx, created.market, 0n, USDC_100);
  const propose = await ctx.walletClient.writeContract({
    address: ctx.contracts.oracle,
    abi: ctx.artifacts.OptimisticResultOracle.abi,
    functionName: "proposeResult",
    args: [created.market, { marketId: created.marketId, winningOutcome: 1, homeScore: 0, awayScore: 0, dataSourceHash: keccak256(toHex("disputed-events")), evidenceUri: "demo://contracts/full-flow/challenged" }],
  });
  await wait(ctx.publicClient, propose);
  const challenge = await ctx.walletClient.writeContract({ address: ctx.contracts.oracle, abi: ctx.artifacts.OptimisticResultOracle.abi, functionName: "challenge", args: [created.marketId, "operator disputes provider result", "demo://contracts/full-flow/challenge-evidence"] });
  await wait(ctx.publicClient, challenge);
  const adminResolve = await ctx.walletClient.writeContract({ address: ctx.contracts.oracle, abi: ctx.artifacts.OptimisticResultOracle.abi, functionName: "adminResolve", args: [created.marketId, 0] });
  await wait(ctx.publicClient, adminResolve);
  const yesShares = await positionBalance(ctx, created.conditionId, 0n);
  const redeemYes = await ctx.walletClient.writeContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "redeem", args: [0n, yesShares] });
  await wait(ctx.publicClient, redeemYes);
  const status = await ctx.publicClient.readContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "status" }) as bigint;
  return {
    market: created.market,
    marketId: created.marketId,
    conditionId: created.conditionId,
    txHashes: { createMarket: created.hash, buyYes: yes.buy, propose, challenge, adminResolve, redeemYes },
    balances: { yesSharesRedeemed: yesShares.toString() },
    status: statusLabel(status),
  };
}

async function voidRefund(ctx: Awaited<ReturnType<typeof deployAll>>): Promise<ScenarioReport> {
  const created = await createMarket(ctx, "void");
  const yes = await mintApproveBuy(ctx, created.market, 0n, USDC_100);
  const voidMarket = await ctx.walletClient.writeContract({ address: ctx.contracts.oracle, abi: ctx.artifacts.OptimisticResultOracle.abi, functionName: "voidMarket", args: [created.market, created.marketId] });
  await wait(ctx.publicClient, voidMarket);
  const yesShares = await positionBalance(ctx, created.conditionId, 0n);
  const refund = await ctx.walletClient.writeContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "refund", args: [0n, yesShares] });
  await wait(ctx.publicClient, refund);
  const status = await ctx.publicClient.readContract({ address: created.market, abi: ctx.artifacts.WorldCupMarket.abi, functionName: "status" }) as bigint;
  return {
    market: created.market,
    marketId: created.marketId,
    conditionId: created.conditionId,
    txHashes: { createMarket: created.hash, buyYes: yes.buy, voidMarket, refund },
    balances: { yesSharesRefunded: yesShares.toString() },
    status: statusLabel(status),
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const anvil = await ensureAnvil(options);
  try {
    const ctx = await deployAll(options);
    const happy = await happyFinalizeRedeem(ctx);
    const challenged = await challengedAdminResolve(ctx);
    const voided = await voidRefund(ctx);
    const report = {
      ok: true,
      rpcUrl: options.rpcUrl,
      chainId: await ctx.publicClient.getChainId(),
      anvilStartedByCli: anvil.started,
      deployer: ctx.account.address,
      contracts: ctx.contracts,
      deployTxs: ctx.deployTxs,
      scenarios: { happyFinalizeRedeem: happy, challengedAdminResolve: challenged, voidRefund: voided },
    };
    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/contracts-full-flow-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    anvil.stop();
  }
}

await main();
