import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("contract CLI and script matrix", () => {
  test("exposes explicit contract script commands", () => {
    expect(rootPackage.scripts["contracts:flow"]).toBe("bun scripts/contracts-full-flow.ts");
    expect(rootPackage.scripts["contracts:script:full-flow"]).toContain("contracts/script/FullFlow.s.sol");
    expect(rootPackage.scripts["contracts:coverage"]).toBe(rootPackage.scripts["coverage:contracts"]);
  });

  test("full-flow Solidity script covers finalize and void paths", () => {
    const script = readFileSync("contracts/script/FullFlow.s.sol", "utf8");
    expect(script).toContain("function run()");
    expect(script).toContain("proposeResult");
    expect(script).toContain("finalize");
    expect(script).toContain("voidMarket");
    expect(script).toContain("refund");
  });
});
