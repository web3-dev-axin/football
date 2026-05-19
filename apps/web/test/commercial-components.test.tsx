import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorConsole } from "../components/operator/OperatorConsole";
import { MarketMatrixPanel } from "../components/markets/MarketMatrixPanel";
import { TransactionStateBadge } from "../components/ui/TransactionStateBadge";
import { createDemoDbWithCommercialMarkets } from "../lib/demo-data";

describe("commercial web components", () => {
  test("renders market matrix with commercial types and disabled high-risk markets", () => {
    const { commercialMarkets } = createDemoDbWithCommercialMarkets();
    const html = renderToStaticMarkup(<MarketMatrixPanel markets={commercialMarkets} />);
    expect(html).toContain("5-minute goal window");
    expect(html).toContain("10-minute goal window");
    expect(html).toContain("15-minute goal window");
    expect(html).toContain("Next goal team");
    expect(html).toContain("Chain creation gated");
  });

  test("renders operator console controls and audit trail", () => {
    const { db } = createDemoDbWithCommercialMarkets();
    db.pauseMarket("market-demo-63-73", "operator-1", "provider delayed");
    const html = renderToStaticMarkup(<OperatorConsole db={db} />);
    expect(html).toContain("Operator Console");
    expect(html).toContain("Feature Flags");
    expect(html).toContain("Risk Limits");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("market.paused");
  });

  test("renders transaction state badges", () => {
    expect(renderToStaticMarkup(<TransactionStateBadge state="confirming" />)).toContain("Confirming");
    expect(renderToStaticMarkup(<TransactionStateBadge state="failed" />)).toContain("Failed");
  });
});
