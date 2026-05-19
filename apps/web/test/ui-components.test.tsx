import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton, SkeletonCard } from "../components/ui/Skeleton";
import { DataFreshnessBadge } from "../components/ui/DataFreshnessBadge";
import { DeviationBadge } from "../components/ui/DeviationBadge";
import { TxStatusBadge } from "../components/ui/TxStatusBadge";
import { PageHero } from "../components/ui/PageHero";
import { StatCard } from "../components/ui/StatCard";

describe("ui primitives", () => {
  test("EmptyState shows title and description", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing" description="Try later" />);
    expect(html).toContain("Nothing");
    expect(html).toContain("Try later");
    expect(html).toContain("empty-state");
  });

  test("Skeleton renders shimmer block", () => {
    const html = renderToStaticMarkup(<Skeleton />);
    expect(html).toContain("skeleton");
    const card = renderToStaticMarkup(<SkeletonCard />);
    expect(card).toContain("skeleton");
  });

  test("DataFreshnessBadge differentiates verified, review, and pending", () => {
    expect(renderToStaticMarkup(<DataFreshnessBadge status="verified" />)).toContain("Data verified");
    expect(renderToStaticMarkup(<DataFreshnessBadge status="data_review_required" />)).toContain("Data review");
    expect(renderToStaticMarkup(<DataFreshnessBadge status="pending" />)).toContain("Data pending");
  });

  test("DeviationBadge formats deviation pct", () => {
    expect(renderToStaticMarkup(<DeviationBadge status="verified" maxDeviationBps={120} />)).toContain("1.20%");
    expect(renderToStaticMarkup(<DeviationBadge status="data_review_required" maxDeviationBps={2400} />)).toContain("Odds review");
  });

  test("TxStatusBadge hides when idle and shows when active", () => {
    expect(renderToStaticMarkup(<TxStatusBadge status="idle" />)).toBe("");
    const submitting = renderToStaticMarkup(<TxStatusBadge status="submitting" />);
    expect(submitting).toContain("Submitting");
    const success = renderToStaticMarkup(<TxStatusBadge status="success" txHash="0xabc" explorerUrl="https://example.com" />);
    expect(success).toContain("View tx");
    expect(success).toContain("0xabc");
  });

  test("PageHero with compact mode hides media", () => {
    const html = renderToStaticMarkup(<PageHero title="Test" showMedia={false}>body</PageHero>);
    expect(html).toContain("page-hero--compact");
    expect(html).not.toContain("hero-media");
  });

  test("StatCard renders label and value", () => {
    const html = renderToStaticMarkup(<StatCard label="Open" value="3" helper="positions" />);
    expect(html).toContain("Open");
    expect(html).toContain("3");
    expect(html).toContain("positions");
  });

  // Guard against accidentally surfacing dev-only wording in user-visible UI.
  // We scan string literals across all consumer-facing source files (app/ + components/),
  // excluding env-var identifiers and import specifiers which never reach the DOM.
  test("no 'mock' / 'demo' / 'testnet' wording leaks into user-visible strings", () => {
    const root = new URL("..", import.meta.url).pathname;
    const dirs = [join(root, "app"), join(root, "components")];
    const offenses: Array<{ file: string; line: number; text: string }> = [];
    const stringLiteralRe = /(?:"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\$]*(?:\\.[^`\\$]*)*)`)/g;
    const forbiddenRe = /\b(mock|demo|testnet)\b/i;
    // Whitelist matches inside strings that are clearly identifiers / URLs / file paths
    const isIdentifierLike = (s: string) => /^[A-Z0-9_]+$/.test(s) || /^[a-z][\w-]*$/.test(s) || s.includes("/") || s.includes("\\");

    for (const dir of dirs) {
      walk(dir, (file) => {
        if (!file.match(/\.(tsx?|jsx?)$/)) return;
        if (file.includes("/lib/demo-data")) return; // server-side wiring only
        if (file.includes("/operator/")) return; // operator console is gated and uses internal IDs
        const content = readFileSync(file, "utf8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          // Skip import statements and env-var references entirely
          if (/^\s*import\b/.test(line)) return;
          if (line.includes("process.env.")) return;
          let match: RegExpExecArray | null;
          stringLiteralRe.lastIndex = 0;
          while ((match = stringLiteralRe.exec(line)) !== null) {
            const literal = match[1] ?? match[2] ?? match[3] ?? "";
            if (!literal) continue;
            if (isIdentifierLike(literal)) continue;
            if (forbiddenRe.test(literal)) {
              offenses.push({ file: file.replace(root, "."), line: idx + 1, text: literal });
            }
          }
        });
      });
    }
    if (offenses.length > 0) {
      const detail = offenses.map((o) => `  ${o.file}:${o.line} → "${o.text}"`).join("\n");
      throw new Error(`Found dev-only wording in user-visible strings:\n${detail}`);
    }
    expect(offenses.length).toBe(0);
  });
});

function walk(dir: string, visit: (file: string) => void): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, visit);
    else visit(full);
  }
}
