import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { XLayerDeployments, XLayerInfraDeployment } from "@polygoal/shared";

const DEPLOYMENTS_PATH = "deployments/xlayer-testnet.json";
const DEFAULT_RPC_URL = "https://testrpc.xlayer.tech/terigon";
const DEFAULT_CHAIN_ID = 1952;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

type Artifact = {
  abi: Abi;
  bytecode: { object: Hex } | Hex;
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

async function waitForContract(
  publicClient: ReturnType<typeof createPublicClient>,
  hash: Hex,
): Promise<Address> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress || receipt.contractAddress === ZERO_ADDRESS) {
    throw new Error(`Transaction ${hash} did not create a contract`);
  }
  const code = await publicClient.getBytecode({ address: receipt.contractAddress });
  if (!code || code === "0x") throw new Error(`No bytecode found at ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

function readDeployments(): XLayerDeployments {
  if (!existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(`Missing deployments file: ${DEPLOYMENTS_PATH}`);
  }
  return JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) as XLayerDeployments;
}

function writeDeployments(deployments: XLayerDeployments): void {
  writeFileSync(DEPLOYMENTS_PATH, `${JSON.stringify(deployments, null, 2)}\n`);
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;
  const chainId = Number(process.env.CHAIN_ID ?? DEFAULT_CHAIN_ID);
  if (chainId !== DEFAULT_CHAIN_ID) {
    throw new Error(`Refusing to deploy to unexpected chain id ${chainId}; expected ${DEFAULT_CHAIN_ID}`);
  }

  const deployments = readDeployments();
  if (deployments.infra && process.env.FORCE_REDEPLOY_INFRA !== "true") {
    throw new Error(
      `infra is already populated in ${DEPLOYMENTS_PATH}. Re-running would orphan ${Object.keys(deployments.markets).length} markets. ` +
        `Set FORCE_REDEPLOY_INFRA=true and manually clear markets {} if you really intend to redeploy.`,
    );
  }

  run("forge", ["build", "--root", "contracts"]);

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

  const MockUSDC = artifact("MockUSDC");
  const ConditionalTokensLite = artifact("ConditionalTokensLite");
  const OptimisticResultOracle = artifact("OptimisticResultOracle");
  const WorldCupMarketFactory = artifact("WorldCupMarketFactory");

  const txHashes: XLayerInfraDeployment["txHashes"] = {
    mockUsdc: "0x" as Hex,
    ctf: "0x" as Hex,
    oracle: "0x" as Hex,
    marketFactory: "0x" as Hex,
    transferCtfOwnership: "0x" as Hex,
  };

  console.log("Deploying MockUSDC…");
  txHashes.mockUsdc = await walletClient.deployContract({ abi: MockUSDC.abi, bytecode: bytecodeOf(MockUSDC) });
  const mockUsdc = await waitForContract(publicClient, txHashes.mockUsdc);
  console.log(`  MockUSDC -> ${mockUsdc}`);

  console.log("Deploying ConditionalTokensLite…");
  txHashes.ctf = await walletClient.deployContract({ abi: ConditionalTokensLite.abi, bytecode: bytecodeOf(ConditionalTokensLite) });
  const ctf = await waitForContract(publicClient, txHashes.ctf);
  console.log(`  ConditionalTokensLite -> ${ctf}`);

  console.log("Deploying OptimisticResultOracle…");
  txHashes.oracle = await walletClient.deployContract({
    abi: OptimisticResultOracle.abi,
    bytecode: bytecodeOf(OptimisticResultOracle),
    args: [600n],
  });
  const oracle = await waitForContract(publicClient, txHashes.oracle);
  console.log(`  OptimisticResultOracle -> ${oracle}`);

  console.log("Deploying WorldCupMarketFactory…");
  txHashes.marketFactory = await walletClient.deployContract({
    abi: WorldCupMarketFactory.abi,
    bytecode: bytecodeOf(WorldCupMarketFactory),
    args: [mockUsdc, ctf, oracle],
  });
  const marketFactory = await waitForContract(publicClient, txHashes.marketFactory);
  console.log(`  WorldCupMarketFactory -> ${marketFactory}`);

  console.log("Transferring CTF ownership to factory…");
  txHashes.transferCtfOwnership = await walletClient.writeContract({
    address: ctf,
    abi: ConditionalTokensLite.abi,
    functionName: "transferOwnership",
    args: [marketFactory],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHashes.transferCtfOwnership });

  const infra: XLayerInfraDeployment = {
    deployedAt: new Date().toISOString(),
    deployer: account.address,
    mockUsdc,
    ctf,
    oracle,
    marketFactory,
    txHashes,
  };

  deployments.infra = infra;
  if (process.env.FORCE_REDEPLOY_INFRA === "true") {
    deployments.markets = {};
  }
  writeDeployments(deployments);

  console.log("\nInfra deployment complete.");
  console.log(`Deployer ${account.address} balance: ${formatEther(balance)} OKB`);
  console.log(`Wrote ${DEPLOYMENTS_PATH}`);
  console.log(`Next: bun scripts/deploy-xlayer-markets.ts`);
}

await main();
