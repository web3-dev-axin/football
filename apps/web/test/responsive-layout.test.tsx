import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as LayoutModule from "../app/layout";
import { MarketDetail } from "../components/markets/MarketDetail";
import { TradeForm } from "../components/markets/TradeForm";
import { SellPanel } from "../components/markets/SellPanel";
import { createDemoDbWithMarket } from "../lib/demo-data";

describe("H5 responsive layout", () => {
  test("root layout exposes mobile viewport metadata and structured nav regions", () => {
    const layout = LayoutModule as typeof LayoutModule & {
      viewport?: { width?: string; initialScale?: number; viewportFit?: string };
    };
    const html = renderToStaticMarkup(
      <LayoutModule.default>
        <main>Responsive content</main>
      </LayoutModule.default>,
    );

    expect(layout.viewport).toEqual({ width: "device-width", initialScale: 1, viewportFit: "cover" });
    expect(html).toContain('class="nav-shell"');
    expect(html).toContain('class="nav-brand"');
    expect(html).toContain('class="nav-actions"');
  });

  test("market detail and trade panels expose mobile-friendly grouping hooks", () => {
    const { market } = createDemoDbWithMarket();
    const detail = renderToStaticMarkup(<MarketDetail market={market} />);
    const buy = renderToStaticMarkup(<TradeForm market={market} wallet={{ connected: true, chainId: 31337 }} />);
    const sell = renderToStaticMarkup(<SellPanel market={market} wallet={{ connected: true, chainId: 31337 }} />);

    expect(detail).toContain('class="two-col trade-layout"');
    expect(detail).toContain("fixture-meta");
    expect(buy).toContain('class="metric-list"');
    expect(sell).toContain('class="metric-list"');
  });

  test("trade inputs and safe-area CSS are mobile friendly", () => {
    const { market } = createDemoDbWithMarket();
    const buy = renderToStaticMarkup(<TradeForm market={market} wallet={{ connected: true, chainId: 31337 }} />);
    const sell = renderToStaticMarkup(<SellPanel market={market} wallet={{ connected: true, chainId: 31337 }} />);
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

    expect(buy).toContain('inputMode="decimal"');
    expect(sell).toContain('inputMode="decimal"');
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});
