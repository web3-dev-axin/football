import { describe, expect, test } from "bun:test";
import { mockUsdcAbi, parseRawAmount, worldCupMarketAbi } from "./chain";

describe("sdk chain helpers", () => {
  test("parses USDT decimal amounts to raw units", () => {
    expect(parseRawAmount("100")).toBe(100_000_000n);
    expect(parseRawAmount("1.25")).toBe(1_250_000n);
    expect(parseRawAmount("0.000001")).toBe(1n);
    expect(() => parseRawAmount("abc")).toThrow("Invalid amount");
  });

  test("exports contract ABIs for wallet-backed actions", () => {
    const marketFns = worldCupMarketAbi.map((item) => item.type === "function" ? item.name : "");
    expect(marketFns).toContain("buy");
    expect(marketFns).toContain("sell");
    expect(marketFns).toContain("redeem");
    expect(marketFns).toContain("refund");
    const usdcFns = mockUsdcAbi.map((item) => item.type === "function" ? item.name : "");
    expect(usdcFns).toContain("approve");
    expect(usdcFns).toContain("mint");
  });
});
