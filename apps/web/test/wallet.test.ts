import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletProvider } from "../components/wallet/WalletProvider";
import { WalletPill } from "../components/wallet/WalletPill";
import { canTrade, connectInjectedWallet, walletStatusLabel, type EthereumProvider } from "../lib/wallet";

describe("wallet helpers", () => {
  test("labels disconnected, wrong network, and connected states", () => {
    expect(walletStatusLabel({ connected: false })).toBe("Connect wallet");
    expect(walletStatusLabel({ connected: true, chainId: 1 })).toBe("Wrong network");
    expect(walletStatusLabel({ connected: true, chainId: 1952, address: "0x0000000000000000000000000000000000000aaa" })).toBe("Connected 0x0000");
  });

  test("allows trading only for connected X Layer wallet on live market", () => {
    expect(canTrade({ connected: true, chainId: 1952 }, "live_trading")).toBe(true);
    expect(canTrade({ connected: true, chainId: 1952 }, "closing_soon")).toBe(true);
    expect(canTrade({ connected: true, chainId: 31337 }, "live_trading")).toBe(false);
    expect(canTrade({ connected: false }, "live_trading")).toBe(false);
    expect(canTrade({ connected: true, chainId: 1952 }, "closed")).toBe(false);
  });

  test("WalletPill renders a Connect wallet CTA when no wallet is connected", () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletProvider, null, React.createElement(WalletPill)),
    );
    expect(html).toContain("<button");
    expect(html).toContain("Connect wallet");
    expect(html).toContain("X Layer");
    expect(html).not.toContain("Testnet");
  });

  test("connects, switches to X Layer, returns the new chain id", async () => {
    const calls: Array<{ method: string; params?: unknown[] | Record<string, unknown> }> = [];
    let switchAttempts = 0;
    const address = "0x0000000000000000000000000000000000000aaa" as const;
    const provider: EthereumProvider = {
      async request<T>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T> {
        calls.push(args);
        if (args.method === "eth_requestAccounts") return [address] as T;
        if (args.method === "eth_chainId") return "0x7a0" as T;
        if (args.method === "wallet_switchEthereumChain") {
          switchAttempts += 1;
          if (switchAttempts === 1) {
            const error = new Error("unknown chain") as Error & { code: number };
            error.code = 4902;
            throw error;
          }
          return null as T;
        }
        if (args.method === "wallet_addEthereumChain") return null as T;
        throw new Error(`unexpected method ${args.method}`);
      },
    };

    await expect(connectInjectedWallet(provider)).resolves.toEqual({
      connected: true,
      address,
      chainId: 1952,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "eth_requestAccounts",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
      "eth_chainId",
    ]);
  });
});
