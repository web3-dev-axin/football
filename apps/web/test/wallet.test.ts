import { describe, expect, test } from "bun:test";
import { canTrade, walletStatusLabel } from "../lib/wallet";

describe("wallet helpers", () => {
  test("labels disconnected, wrong network, and connected states", () => {
    expect(walletStatusLabel({ connected: false })).toBe("Connect wallet");
    expect(walletStatusLabel({ connected: true, chainId: 1 })).toBe("Wrong network");
    expect(walletStatusLabel({ connected: true, chainId: 31337, address: "0x0000000000000000000000000000000000000aaa" })).toBe("Connected 0x0000");
  });

  test("allows trading only for connected Anvil wallet on live market", () => {
    expect(canTrade({ connected: true, chainId: 31337 }, "live_trading")).toBe(true);
    expect(canTrade({ connected: true, chainId: 31337 }, "closing_soon")).toBe(true);
    expect(canTrade({ connected: true, chainId: 1 }, "live_trading")).toBe(false);
    expect(canTrade({ connected: false }, "live_trading")).toBe(false);
    expect(canTrade({ connected: true, chainId: 31337 }, "closed")).toBe(false);
  });
});
