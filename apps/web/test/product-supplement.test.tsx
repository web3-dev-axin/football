import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_MARKET_ID } from "@worldcup/shared";
import SchedulePage from "../app/schedule/page";
import MarketPage from "../app/markets/[marketId]/page";
import { SellPanel } from "../components/markets/SellPanel";
import { MarketDetail } from "../components/markets/MarketDetail";
import { OddsDeviationBadge } from "../components/markets/OddsDeviationBadge";
import { createDemoDbWithMarket } from "../lib/demo-data";

describe("product supplement web", () => {
  test("renders schedule discovery page", () => {
    const html = renderToStaticMarkup(<SchedulePage />);
    expect(html).toContain("World Cup Schedule");
    expect(html).toContain("Brazil vs Morocco");
  });

  test("renders sell flow and odds deviation context", () => {
    const { market } = createDemoDbWithMarket();
    const sell = renderToStaticMarkup(<SellPanel market={market} wallet={{ connected: true, chainId: 31337 }} />);
    expect(sell).toContain("Sell Yes");
    expect(sell).toContain("Estimated Mock USDC received");

    const odds = renderToStaticMarkup(<OddsDeviationBadge status="verified" maxDeviationBps={120} />);
    expect(odds).toContain("Odds verified");
    expect(odds).toContain("1.20%");

    const marketDetail = renderToStaticMarkup(<MarketDetail market={{ ...market, oddsComparison: { id: "odds", marketId: market.id, status: "data_review_required", maxDeviationBps: 2200, mismatches: [], comparedAt: "2026-06-13T22:26:00.000Z" } }} />);
    expect(marketDetail).toContain("Odds review required");
  });

  test("market page unwraps async route params before loading market data", async () => {
    const element = await MarketPage({ params: Promise.resolve({ marketId: DEMO_MARKET_ID }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Brazil vs Morocco");
    expect(html).not.toContain("Market undefined not loaded from API");
  });
});
