"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  APP_CHAIN,
  connectInjectedWallet,
  injectedEthereum,
  parseWalletChainId,
  readInjectedWallet,
  switchToAppChain,
  type WalletView,
} from "../../lib/wallet";

export type WalletStatus =
  | "uninitialized"
  | "no-provider"
  | "disconnected"
  | "connecting"
  | "wrong-network"
  | "connected"
  | "error";

export type WalletContextValue = {
  wallet: WalletView;
  status: WalletStatus;
  errorMessage?: string;
  hasInjectedProvider: boolean;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function deriveStatus(wallet: WalletView, hasInjectedProvider: boolean, isConnecting: boolean, hasError: boolean): WalletStatus {
  if (hasError) return "error";
  if (!hasInjectedProvider) return "no-provider";
  if (isConnecting) return "connecting";
  if (!wallet.connected) return "disconnected";
  if (wallet.chainId !== APP_CHAIN.id) return "wrong-network";
  return "connected";
}

export function WalletProvider({ children, initialWallet }: { children: ReactNode; initialWallet?: WalletView }) {
  const [wallet, setWallet] = useState<WalletView>(initialWallet ?? { connected: false });
  const [hasInjectedProvider, setHasInjectedProvider] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    const provider = injectedEthereum();
    setHasInjectedProvider(Boolean(provider));
    if (!provider) return;

    let mounted = true;
    readInjectedWallet(provider)
      .then((next) => {
        if (mounted) setWallet(next);
      })
      .catch(() => {
        if (mounted) setErrorMessage("Could not read wallet");
      });

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? (args[0] as `0x${string}`[]) : [];
      setWallet((current) => ({
        connected: accounts.length > 0,
        address: accounts[0],
        chainId: current.chainId,
      }));
    };
    const handleChainChanged = (...args: unknown[]) => {
      const nextChainId = args[0];
      if (typeof nextChainId !== "string") return;
      setWallet((current) => ({ ...current, chainId: parseWalletChainId(nextChainId) }));
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      mounted = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = injectedEthereum();
    setErrorMessage(undefined);
    if (!provider) {
      setHasInjectedProvider(false);
      setErrorMessage("Install a browser wallet to continue");
      return;
    }
    setIsConnecting(true);
    try {
      const next = await connectInjectedWallet(provider);
      setWallet(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const provider = injectedEthereum();
    if (!provider) return;
    setErrorMessage(undefined);
    try {
      await switchToAppChain(provider);
      const chainId = await provider.request<string>({ method: "eth_chainId" });
      setWallet((current) => ({ ...current, chainId: parseWalletChainId(chainId) }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not switch network");
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({ connected: false });
    setErrorMessage(undefined);
  }, []);

  const status = deriveStatus(wallet, hasInjectedProvider, isConnecting, Boolean(errorMessage));

  const value = useMemo<WalletContextValue>(
    () => ({ wallet, status, errorMessage, hasInjectedProvider, connect, switchNetwork, disconnect }),
    [wallet, status, errorMessage, hasInjectedProvider, connect, switchNetwork, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) {
    return {
      wallet: { connected: false },
      status: "disconnected",
      hasInjectedProvider: false,
      connect: async () => {},
      switchNetwork: async () => {},
      disconnect: () => {},
    };
  }
  return value;
}
