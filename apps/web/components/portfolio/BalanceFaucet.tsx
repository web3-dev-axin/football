"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@heroui/react";
import { createBrowserWalletClient, createRpcPublicClient, mintUsdc, readUsdcBalance } from "@polygoal/sdk";
import { APP_CHAIN, APP_VIEM_CHAIN, injectedEthereum } from "../../lib/wallet";
import { useWallet } from "../wallet/WalletProvider";
import { TxStatusBadge, type TxStatus } from "../ui/TxStatusBadge";
import { formatUsdc } from "../../lib/market-copy";

const FAUCET_AMOUNT_RAW = 1_000_000_000n;

function isAddressLike(value: string | null | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
}

type FaucetState =
  | { kind: "ready" }
  | { kind: "needs-provider" }
  | { kind: "needs-connect" }
  | { kind: "wrong-network" }
  | { kind: "missing-address" };

export function BalanceFaucet({ showFaucet, viewerAddress: viewerProp }: { showFaucet?: boolean; viewerAddress?: `0x${string}` } = {}) {
  const { wallet, status, connect, switchNetwork, hasInjectedProvider } = useWallet();
  const searchParams = useSearchParams();
  const viewerFromQuery = searchParams?.get("as") ?? null;
  const viewerAddress = viewerProp ?? (isAddressLike(viewerFromQuery) ? viewerFromQuery : undefined);
  // Auto-detect faucet visibility: only enabled on non-mainnet chains.
  const faucetEnabled = showFaucet ?? (APP_CHAIN.id !== 1 && APP_CHAIN.id !== 196);
  // In viewer mode we hide the claim button (you can't faucet for someone else's
  // wallet) but still show their on-chain USDC balance.
  const isViewerMode = Boolean(viewerAddress);
  const [balanceRaw, setBalanceRaw] = useState<string>("0");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const usdcAddress = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS;
  const hasUsdcAddress = Boolean(usdcAddress?.startsWith("0x") && usdcAddress.length === 42);

  const balanceAddress = viewerAddress ?? (wallet.connected ? (wallet.address as `0x${string}` | undefined) : undefined);

  useEffect(() => {
    if (!balanceAddress || !hasUsdcAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const publicClient = createRpcPublicClient(APP_VIEM_CHAIN, APP_CHAIN.rpcUrls[0] ?? "");
        const balance = await readUsdcBalance(publicClient, { usdcAddress: usdcAddress as `0x${string}`, owner: balanceAddress });
        if (!cancelled) setBalanceRaw(balance.toString());
      } catch {
        // ignore balance read errors; UI still functional
      }
    })();
    return () => { cancelled = true; };
  }, [balanceAddress, usdcAddress, hasUsdcAddress, txStatus]);

  const faucetState: FaucetState = !hasInjectedProvider
    ? { kind: "needs-provider" }
    : !wallet.connected
      ? { kind: "needs-connect" }
      : !hasUsdcAddress
        ? { kind: "missing-address" }
        : status === "wrong-network"
          ? { kind: "wrong-network" }
          : { kind: "ready" };

  const handleClick = useCallback(async () => {
    setError(undefined);
    setTxHash(undefined);
    if (faucetState.kind === "needs-provider" || faucetState.kind === "needs-connect") {
      await connect();
      return;
    }
    if (faucetState.kind === "wrong-network") {
      await switchNetwork();
      return;
    }
    if (faucetState.kind === "missing-address") {
      setError("USDC contract address is not configured. Contact support.");
      return;
    }
    const provider = injectedEthereum();
    if (!provider || !wallet.address || !usdcAddress) {
      setError("Wallet provider unavailable. Refresh the page and try again.");
      return;
    }
    setTxStatus("submitting");
    try {
      const walletClient = createBrowserWalletClient(provider, APP_VIEM_CHAIN);
      const hash = await mintUsdc({
        walletClient,
        account: wallet.address,
        usdcAddress: usdcAddress as `0x${string}`,
        to: wallet.address,
        amountRaw: FAUCET_AMOUNT_RAW,
      });
      setTxHash(hash);
      setTxStatus("confirming");
      try {
        const publicClient = createRpcPublicClient(APP_VIEM_CHAIN, APP_CHAIN.rpcUrls[0] ?? "");
        await publicClient.waitForTransactionReceipt({ hash });
        setTxStatus("success");
      } catch {
        setTxStatus("success");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Faucet transaction failed";
      setError(humanizeWalletError(message));
      setTxStatus("failed");
    }
  }, [faucetState.kind, connect, switchNetwork, wallet.address, usdcAddress]);

  if (!faucetEnabled || isViewerMode) {
    return (
      <Card variant="default" className="balance-faucet stack">
        <div>
          <p className="kpi">{isViewerMode ? "USDC balance (viewer)" : "USDC balance"}</p>
          <strong className="balance-faucet-value">{formatUsdc(balanceRaw)}</strong>
        </div>
      </Card>
    );
  }

  const cta = ctaCopy(faucetState, txStatus);

  return (
    <Card variant="default" className="balance-faucet stack">
      <div>
        <p className="kpi">USDC balance</p>
        <strong className="balance-faucet-value">{formatUsdc(balanceRaw)}</strong>
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() => void handleClick()}
        disabled={txStatus === "submitting" || txStatus === "confirming"}
        aria-describedby="faucet-help"
      >
        {cta.label}
      </button>
      <p id="faucet-help" className="kpi">{cta.help}</p>
      {error ? <p className="kpi trade-ticket-error" role="alert">{error}</p> : null}
      <TxStatusBadge status={txStatus} txHash={txHash} explorerUrl={APP_CHAIN.blockExplorerUrls[0]} />
    </Card>
  );
}

function ctaCopy(state: FaucetState, tx: TxStatus): { label: string; help: string } {
  if (tx === "submitting") return { label: "Waiting for wallet…", help: "Approve the transaction in your wallet to receive 1,000 USDC." };
  if (tx === "confirming") return { label: "Confirming on chain…", help: "The faucet transaction is being mined." };
  switch (state.kind) {
    case "needs-provider":
      return { label: "Install a wallet to continue", help: "We could not detect a browser wallet. Install MetaMask or another EIP-1193 wallet, then refresh." };
    case "needs-connect":
      return { label: "Connect wallet to claim USDC", help: "Connect a browser wallet to claim USDC and start trading." };
    case "wrong-network":
      return { label: `Switch to ${APP_CHAIN.name}`, help: `Your wallet is on the wrong network. Switch to ${APP_CHAIN.name} (chain id ${APP_CHAIN.id}) and try again.` };
    case "missing-address":
      return { label: "Faucet unavailable", help: "USDC contract address is not configured. Contact support." };
    case "ready":
      return { label: "Claim 1,000 USDC", help: "Practice funds with no real-world value. Claim more anytime." };
  }
}

function humanizeWalletError(message: string): string {
  if (/user (rejected|denied|cancel(?:l)?ed)/i.test(message)) return "You rejected the transaction in your wallet.";
  if (/insufficient funds/i.test(message)) return "Your wallet does not have enough native token to pay gas.";
  if (/execution reverted/i.test(message)) return "The claim call reverted. The USDC contract may not allow public minting from this address.";
  if (/network|chain/i.test(message)) return "Wallet network mismatch. Switch to the configured network and try again.";
  return message;
}
