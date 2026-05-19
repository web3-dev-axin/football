"use client";

import { APP_CHAIN } from "../../lib/wallet";
import { useWallet } from "./WalletProvider";

function truncateAddress(address: string | undefined): string {
  if (!address) return "wallet";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletPill() {
  const { wallet, status, errorMessage, hasInjectedProvider, connect, switchNetwork, disconnect } = useWallet();

  if (status === "uninitialized" || status === "disconnected" || status === "no-provider" || status === "error" || status === "connecting") {
    const label = status === "connecting"
      ? "Connecting…"
      : status === "no-provider"
        ? "Install wallet"
        : status === "error"
          ? hasInjectedProvider
            ? "Retry connect"
            : "Install wallet"
          : "Connect wallet";
    const tooltip = status === "error" && errorMessage ? errorMessage : undefined;
    return (
      <button
        aria-label={tooltip ? `${label} on ${APP_CHAIN.name}. ${tooltip}` : `${label} on ${APP_CHAIN.name}`}
        className="badge wallet-button"
        disabled={status === "connecting" || !hasInjectedProvider}
        onClick={() => void connect()}
        title={tooltip}
        type="button"
      >
        {label}
        <span className="wallet-network">{APP_CHAIN.name}</span>
      </button>
    );
  }

  if (status === "wrong-network") {
    return (
      <button
        aria-label={`Switch to ${APP_CHAIN.name}`}
        className="badge warn wallet-button"
        onClick={() => void switchNetwork()}
        type="button"
      >
        Switch to {APP_CHAIN.name}
      </button>
    );
  }

  return (
    <button
      aria-label={`${truncateAddress(wallet.address)} on ${APP_CHAIN.name}. Click to disconnect.`}
      className="badge wallet-button"
      onClick={disconnect}
      type="button"
    >
      {truncateAddress(wallet.address)}
      <span className="wallet-network">{APP_CHAIN.name}</span>
    </button>
  );
}
