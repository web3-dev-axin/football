import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createDemoDbWithMarket, createDemoDbWithSettlement } from "../lib/demo-data";
import { LiveWindowCard } from "../components/markets/LiveWindowCard";
import { MarketDetail } from "../components/markets/MarketDetail";
import { TradeForm } from "../components/markets/TradeForm";
import { SettlementPanel } from "../components/settlement/SettlementPanel";

describe("web MVP components", () => {
  test("live window card shows verified data quality and Yes/No outcomes", () => {
    const { liveWindow, market } = createDemoDbWithMarket();
    const html = renderToStaticMarkup(<LiveWindowCard liveWindow={liveWindow} market={market} />);
    expect(html).toContain("data quality: verified");
    expect(html).toContain("Yes / No");
    expect(html).toContain("Open market");
  });

  test("market detail shows outcome probabilities and disconnected wallet action", () => {
    const { market } = createDemoDbWithMarket();
    const html = renderToStaticMarkup(<MarketDetail market={market} />);
    expect(html).toContain("Brazil vs Morocco");
    expect(html).toContain("Yes");
    expect(html).toContain("No");
    expect(html).toContain("Connect wallet");
    expect(html).toContain("VAR-cancelled goals do not count");
    expect(html).toContain("Odds verified");
  });

  test("trade form enables buy only when wallet is connected on Anvil and market is live", () => {
    const { market } = createDemoDbWithMarket();
    const enabled = renderToStaticMarkup(<TradeForm market={market} wallet={{ connected: true, chainId: 31337, address: "0x0000000000000000000000000000000000000aaa" }} />);
    expect(enabled).toContain("Buy Yes");
    expect(enabled).toContain("Potential payout: 100 Mock USDC");
    expect(enabled).not.toContain("disabled");

    const disabled = renderToStaticMarkup(<TradeForm market={{ ...market, status: "closed" }} wallet={{ connected: true, chainId: 31337 }} />);
    expect(disabled).toContain("Trading unavailable");
    expect(disabled).toContain("disabled");
  });

  test("settlement panel exposes redeem state after finalized proposal", () => {
    const { market, proposal } = createDemoDbWithSettlement();
    const html = renderToStaticMarkup(<SettlementPanel market={market} proposal={proposal} />);
    expect(html).toContain("Proposed result: Yes");
    expect(html).toContain("Goals detected in window: 1");
    expect(html).toContain("Redeem winning shares");
    expect(html).not.toContain("disabled");
  });
});
