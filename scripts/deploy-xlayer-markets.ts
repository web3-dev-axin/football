import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEventLogs,
  type Abi,
  type Account,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  WORLDCUP_2026_GROUP_STAGE_FIXTURES,
  computeMatchWinnerCloseTime,
  computeMatchWinnerMarketKey,
  matchWinnerResolutionPolicyHash,
  XLAYER_MATCH_WINNER_OUTCOME_COUNT,
  XLAYER_MATCH_WINNER_WINDOW_END_SECOND,
  XLAYER_MATCH_WINNER_WINDOW_START_SECOND,
  type XLayerDeployments,
  type XLayerMarketDeployment,
} from "@polygoal/shared";

const DEPLOYMENTS_PATH = "deployments/xlayer-testnet.json";
const REPORTS_DIR = "reports";
const DEFAULT_RPC_URL = "https://testrpc.xlayer.tech/terigon";
const DEFAULT_CHAIN_ID = 1952;

type Artifact = { abi: Abi; bytecode: { object: Hex } | Hex };

type DeployResult =
  | { ok: true; marketKey: string; deployment: XLayerMarketDeployment }
  | { ok: false; marketKey: string; error: string };

type DeployReport = {
  startedAt: string;
  finishedAt: string;
  network: { chainId: number; rpcUrl: string };
  attempted: number;
  alreadyDeployed: number;
  successes: Array<{ marketKey: string; marketAddress: `0x${string}`; txHash: Hex }>;
  failures: Array<{ marketKey: string; error: string }>;
};

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function requiredPrivateKey(): Hex {
  const raw = process.env.PRIVATE_KEY?.trim();
  if (!raw) throw new Error("PRIVATE_KEY is required for X Layer testnet deployment");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

function artifact(name: string): Artifact {
  const path = `contracts/out/${name}.sol/${name}.json`;
  if (!existsSync(path)) throw new Error(`Missing artifact ${path}. Run forge build first.`);
  return JSON.parse(readFileSync(path, "utf8")) as Artifact;
}

function bytecodeOf(compiled: Artifact): Hex {
  return typeof compiled.bytecode === "string" ? compiled.bytecode : compiled.bytecode.object;
}

function readDeployments(): XLayerDeployments {
  if (!existsSync(DEPLOYMENTS_PATH)) throw new Error(`Missing deployments file: ${DEPLOYMENTS_PATH}`);
  return JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) as XLayerDeployments;
}

function writeDeployments(deployments: XLayerDeployments): void {
  writeFileSync(DEPLOYMENTS_PATH, `${JSON.stringify(deployments, null, 2)}\n`);
}

function isDryRun(): boolean {
  return process.env.DRY_RUN === "true";
}

function plannedMarkets(): Array<{
  marketKey: string;
  fixtureId: string;
  fifaMatchId: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAtUtc: string;
  closeTimeUnix: number;
}> {
  return WORLDCUP_2026_GROUP_STAGE_FIXTURES.map((fixture) => ({
    marketKey: computeMatchWinnerMarketKey(fixture.id),
    fixtureId: fixture.id,
    fifaMatchId: fixture.fifaMatchId,
    matchNumber: fixture.matchNumber,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    kickoffAtUtc: fixture.kickoffAtUtc,
    closeTimeUnix: computeMatchWinnerCloseTime(fixture.kickoffAtUtc),
  }));
}

async function deployMarket(args: {
  walletClient: ReturnType<typeof createWalletClient>;
  publicClient: ReturnType<typeof createPublicClient>;
  account: Account;
  chain: Chain;
  factoryAddress: `0x${string}`;
  factoryAbi: Abi;
  plan: ReturnType<typeof plannedMarkets>[number];
}): Promise<DeployResult> {
  const { walletClient, publicClient, account, chain, factoryAddress, factoryAbi, plan } = args;
  const policyHash = matchWinnerResolutionPolicyHash();
  try {
    const txHash = await walletClient.writeContract({
      account,
      chain,
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "createMarket",
      args: [
        plan.marketKey,
        plan.fifaMatchId,
        BigInt(XLAYER_MATCH_WINNER_WINDOW_START_SECOND),
        BigInt(XLAYER_MATCH_WINNER_WINDOW_END_SECOND),
        BigInt(plan.closeTimeUnix),
        policyHash,
        BigInt(XLAYER_MATCH_WINNER_OUTCOME_COUNT),
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const events = parseEventLogs({ abi: factoryAbi, eventName: "MarketCreated", logs: receipt.logs }) as Array<{
      args: { marketId: Hex; market: `0x${string}`; conditionId: Hex };
    }>;
    const created = events[0];
    if (!created) throw new Error("MarketCreated event missing from receipt");
    const deployment: XLayerMarketDeployment = {
      fixtureId: plan.fixtureId,
      fifaMatchId: plan.fifaMatchId,
      matchNumber: plan.matchNumber,
      marketType: "match_winner",
      outcomeCount: XLAYER_MATCH_WINNER_OUTCOME_COUNT,
      homeTeam: plan.homeTeam,
      awayTeam: plan.awayTeam,
      kickoffAtUtc: plan.kickoffAtUtc,
      closeTimeUnix: plan.closeTimeUnix,
      marketAddress: created.args.market,
      marketId: created.args.marketId,
      conditionId: created.args.conditionId,
      resolutionPolicyHash: policyHash,
      txHash,
      blockNumber: Number(receipt.blockNumber),
    };
    return { ok: true, marketKey: plan.marketKey, deployment };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, marketKey: plan.marketKey, error: message };
  }
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;
  const chainId = Number(process.env.CHAIN_ID ?? DEFAULT_CHAIN_ID);
  if (chainId !== DEFAULT_CHAIN_ID) {
    throw new Error(`Refusing to deploy to unexpected chain id ${chainId}; expected ${DEFAULT_CHAIN_ID}`);
  }

  const deployments = readDeployments();
  const plans = plannedMarkets();
  const startedAt = new Date().toISOString();

  if (isDryRun()) {
    const preview = plans.slice(0, 5).map((plan) => ({
      marketKey: plan.marketKey,
      kickoffAtUtc: plan.kickoffAtUtc,
      closeTimeUnix: plan.closeTimeUnix,
      closeTimeUtc: new Date(plan.closeTimeUnix * 1000).toISOString(),
    }));
    console.log(`DRY_RUN: would deploy ${plans.length} match_winner markets.`);
    console.log("First 5 plans:");
    console.log(JSON.stringify(preview, null, 2));
    console.log(`Already deployed in JSON: ${Object.keys(deployments.markets).length}`);
    return;
  }

  if (!deployments.infra) {
    throw new Error(`infra not deployed yet. Run bun scripts/deploy-xlayer-infra.ts first.`);
  }
  const factoryAddress = deployments.infra.marketFactory;

  run("forge", ["build", "--root", "contracts"]);

  const factoryArtifact = artifact("WorldCupMarketFactory");

  const account = privateKeyToAccount(requiredPrivateKey());
  const xLayerTestnet = defineChain({
    id: chainId,
    name: deployments.network.name,
    nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "OKX X Layer Testnet", url: deployments.network.explorerUrl } },
    testnet: true,
  });
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: xLayerTestnet, transport });
  const walletClient = createWalletClient({ account, chain: xLayerTestnet, transport });

  const remoteChainId = await publicClient.getChainId();
  if (remoteChainId !== chainId) throw new Error(`RPC returned chain id ${remoteChainId}; expected ${chainId}`);

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) throw new Error(`Deployer ${account.address} has zero testnet OKB`);

  const report: DeployReport = {
    startedAt,
    finishedAt: startedAt,
    network: { chainId, rpcUrl },
    attempted: 0,
    alreadyDeployed: 0,
    successes: [],
    failures: [],
  };

  for (const plan of plans) {
    if (deployments.markets[plan.marketKey]) {
      report.alreadyDeployed += 1;
      continue;
    }
    report.attempted += 1;
    console.log(`[${report.attempted}] createMarket(${plan.marketKey})…`);
    const result = await deployMarket({
      walletClient,
      publicClient,
      account,
      chain: xLayerTestnet,
      factoryAddress,
      factoryAbi: factoryArtifact.abi,
      plan,
    });
    if (result.ok) {
      deployments.markets[result.marketKey] = result.deployment;
      writeDeployments(deployments);
      report.successes.push({
        marketKey: result.marketKey,
        marketAddress: result.deployment.marketAddress,
        txHash: result.deployment.txHash,
      });
      console.log(`    -> ${result.deployment.marketAddress} (tx ${result.deployment.txHash})`);
    } else {
      report.failures.push({ marketKey: result.marketKey, error: result.error });
      console.error(`    FAILED: ${result.error}`);
    }
  }

  report.finishedAt = new Date().toISOString();
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = `${REPORTS_DIR}/xlayer-deploy-markets-${startedAt.replaceAll(":", "-")}.json`;
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\nMarkets deployment finished.");
  console.log(`  Already deployed (skipped): ${report.alreadyDeployed}`);
  console.log(`  Successful this run:        ${report.successes.length}`);
  console.log(`  Failed this run:            ${report.failures.length}`);
  console.log(`  Report:                     ${reportPath}`);

  if (report.failures.length > 0) {
    process.exit(1);
  }
}

await main();
