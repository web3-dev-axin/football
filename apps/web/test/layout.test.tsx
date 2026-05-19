import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as LayoutModule from "../app/layout";

describe("root layout", () => {
  test("exposes mobile viewport metadata and a unified 3-item nav", () => {
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
    expect(html).toContain('src="/brand/logo-mark-green.png"');
    expect(html).toContain('class="nav-actions"');
    expect(html).toContain('class="mobile-tabbar"');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Primary mobile navigation"');
    expect(html).toContain("Markets");
    expect(html).toContain("Portfolio");
    expect(html).toContain("Settlements");
    expect(html).not.toContain(">Schedule<");
    expect(html).not.toContain("Clean Stadium");
    expect(html).not.toContain("Operator");
    expect(html).not.toMatch(/\b(?:testnet|mock)\b/i);
  });

  test("safe-area CSS and mobile tabbar styles remain", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain(".mobile-tabbar");
    expect(css).toContain("--color-brand: #05b34f");
  });
});
