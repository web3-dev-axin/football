import { createPublicClient, createWalletClient, custom, http, type Address, type Chain, type EIP1193Provider, type PublicClient, type WalletClient } from "viem";
import { foundry } from "viem/chains";

export function createAnvilPublicClient(rpcUrl = "http://localhost:8545") {
  return createPublicClient({ chain: foundry, transport: http(rpcUrl) });
}

export const mockUsdcAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

export const conditionalTokensLiteAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "", type: "uint256" }, { name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getPositionId", stateMutability: "pure", inputs: [{ name: "conditionId", type: "bytes32" }, { name: "outcomeIndex", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const worldCupMarketAbi = [
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "outcomeIndex", type: "uint256" }, { name: "collateralAmount", type: "uint256" }, { name: "minSharesOut", type: "uint256" }], outputs: [{ name: "sharesOut", type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "outcomeIndex", type: "uint256" }, { name: "sharesAmount", type: "uint256" }, { name: "minCollateralOut", type: "uint256" }], outputs: [{ name: "collateralOut", type: "uint256" }] },
  { type: "function", name: "redeem", stateMutability: "nonpayable", inputs: [{ name: "outcomeIndex", type: "uint256" }, { name: "sharesAmount", type: "uint256" }], outputs: [{ name: "collateralPaid", type: "uint256" }] },
  { type: "function", name: "refund", stateMutability: "nonpayable", inputs: [{ name: "outcomeIndex", type: "uint256" }, { name: "sharesAmount", type: "uint256" }], outputs: [{ name: "collateralPaid", type: "uint256" }] },
  { type: "function", name: "conditionId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "outcomeCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "status", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
] as const;

export type ChainActionInput = {
  walletClient: WalletClient;
  account: Address;
};

export type ContractAddresses = {
  usdc: Address;
  ctf: Address;
};

export type MinimalEip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
};

export function createBrowserWalletClient(provider: MinimalEip1193Provider, chain: Chain) {
  return createWalletClient({ chain, transport: custom(provider as EIP1193Provider) });
}

export function createRpcPublicClient(chain: Chain, rpcUrl: string) {
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export function parseRawAmount(value: string, decimals = 6): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Invalid amount");
  const [whole, fraction = ""] = trimmed.split(".");
  const normalizedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
}

export async function approveUsdc(input: ChainActionInput & { usdcAddress: Address; spender: Address; amountRaw: bigint }) {
  return input.walletClient.writeContract({
    address: input.usdcAddress,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [input.spender, input.amountRaw],
    account: input.account,
    chain: input.walletClient.chain,
  });
}

export async function mintUsdc(input: ChainActionInput & { usdcAddress: Address; to: Address; amountRaw: bigint }) {
  return input.walletClient.writeContract({
    address: input.usdcAddress,
    abi: mockUsdcAbi,
    functionName: "mint",
    args: [input.to, input.amountRaw],
    account: input.account,
    chain: input.walletClient.chain,
  });
}

export async function buyOutcome(input: ChainActionInput & { marketAddress: Address; outcomeIndex: number; collateralAmountRaw: bigint; minSharesOutRaw?: bigint }) {
  return input.walletClient.writeContract({
    address: input.marketAddress,
    abi: worldCupMarketAbi,
    functionName: "buy",
    args: [BigInt(input.outcomeIndex), input.collateralAmountRaw, input.minSharesOutRaw ?? 1n],
    account: input.account,
    chain: input.walletClient.chain,
  });
}

export async function sellOutcome(input: ChainActionInput & { marketAddress: Address; outcomeIndex: number; sharesAmountRaw: bigint; minCollateralOutRaw?: bigint }) {
  return input.walletClient.writeContract({
    address: input.marketAddress,
    abi: worldCupMarketAbi,
    functionName: "sell",
    args: [BigInt(input.outcomeIndex), input.sharesAmountRaw, input.minCollateralOutRaw ?? 1n],
    account: input.account,
    chain: input.walletClient.chain,
  });
}

export async function redeemOutcome(input: ChainActionInput & { marketAddress: Address; outcomeIndex: number; sharesAmountRaw: bigint }) {
  return input.walletClient.writeContract({
    address: input.marketAddress,
    abi: worldCupMarketAbi,
    functionName: "redeem",
    args: [BigInt(input.outcomeIndex), input.sharesAmountRaw],
    account: input.account,
    chain: input.walletClient.chain,
  });
}

export async function refundOutcome(input: ChainActionInput & { marketAddress: Address; outcomeIndex: number; sharesAmountRaw: bigint }) {
  return input.walletClient.writeContract({
    address: input.marketAddress,
    abi: worldCupMarketAbi,
    functionName: "refund",
    args: [BigInt(input.outcomeIndex), input.sharesAmountRaw],
    account: input.account,
    chain: input.walletClient.chain,
  });
}

export async function readAllowance(publicClient: PublicClient, input: { usdcAddress: Address; owner: Address; spender: Address }) {
  return publicClient.readContract({
    address: input.usdcAddress,
    abi: mockUsdcAbi,
    functionName: "allowance",
    args: [input.owner, input.spender],
  });
}

export async function readUsdcBalance(publicClient: PublicClient, input: { usdcAddress: Address; owner: Address }) {
  return publicClient.readContract({
    address: input.usdcAddress,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [input.owner],
  });
}

export async function readMarketConditionId(publicClient: PublicClient, marketAddress: Address) {
  return publicClient.readContract({
    address: marketAddress,
    abi: worldCupMarketAbi,
    functionName: "conditionId",
  });
}

export async function readPositionBalance(publicClient: PublicClient, input: { ctfAddress: Address; conditionId: `0x${string}`; outcomeIndex: number; owner: Address }) {
  const positionId = await publicClient.readContract({
    address: input.ctfAddress,
    abi: conditionalTokensLiteAbi,
    functionName: "getPositionId",
    args: [input.conditionId, BigInt(input.outcomeIndex)],
  });
  return publicClient.readContract({
    address: input.ctfAddress,
    abi: conditionalTokensLiteAbi,
    functionName: "balanceOf",
    args: [positionId, input.owner],
  });
}
