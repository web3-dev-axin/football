import { defineChain } from "viem";

export type WalletView = {
  connected: boolean;
  chainId?: number;
  address?: `0x${string}`;
};

export type EthereumProvider = {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void) => void;
};

export type AppChain = {
  id: number;
  name: string;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
};

export const APP_CHAIN: AppChain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 1952),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "X Layer",
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://testrpc.xlayer.tech/terigon"],
  blockExplorerUrls: [process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://www.okx.com/web3/explorer/xlayer-test"],
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18,
  },
};

export const APP_VIEM_CHAIN = defineChain({
  id: APP_CHAIN.id,
  name: APP_CHAIN.name,
  nativeCurrency: APP_CHAIN.nativeCurrency,
  rpcUrls: {
    default: { http: APP_CHAIN.rpcUrls },
    public: { http: APP_CHAIN.rpcUrls },
  },
  blockExplorers: {
    default: { name: APP_CHAIN.name, url: APP_CHAIN.blockExplorerUrls[0] ?? "" },
  },
});

export function walletStatusLabel(wallet: WalletView, expectedChainId = APP_CHAIN.id): string {
  if (!wallet.connected) return "Connect wallet";
  if (wallet.chainId !== expectedChainId) return "Wrong network";
  return `Connected ${wallet.address?.slice(0, 6) ?? "wallet"}`;
}

export function canTrade(wallet: WalletView, marketStatus: string, expectedChainId = APP_CHAIN.id): boolean {
  return wallet.connected && wallet.chainId === expectedChainId && (marketStatus === "live_trading" || marketStatus === "closing_soon");
}

export function parseWalletChainId(chainId: string | number): number | undefined {
  if (typeof chainId === "number") return chainId;
  const parsed = Number.parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function chainIdHex(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function injectedEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

export async function readInjectedWallet(provider: EthereumProvider): Promise<WalletView> {
  const [accounts, chainId] = await Promise.all([
    provider.request<string[]>({ method: "eth_accounts" }),
    provider.request<string>({ method: "eth_chainId" }),
  ]);

  return {
    connected: accounts.length > 0,
    address: accounts[0] as `0x${string}` | undefined,
    chainId: parseWalletChainId(chainId),
  };
}

export async function switchToAppChain(provider: EthereumProvider, chain = APP_CHAIN): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex(chain.id) }],
    });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex(chain.id),
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls,
          blockExplorerUrls: chain.blockExplorerUrls,
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex(chain.id) }],
    });
  }
}

export async function connectInjectedWallet(provider: EthereumProvider, chain = APP_CHAIN): Promise<WalletView> {
  const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
  await switchToAppChain(provider, chain);
  const chainId = await provider.request<string>({ method: "eth_chainId" });

  return {
    connected: accounts.length > 0,
    address: accounts[0] as `0x${string}` | undefined,
    chainId: parseWalletChainId(chainId),
  };
}

function isUnknownChainError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 4902;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
