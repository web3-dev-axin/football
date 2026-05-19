import { expect, test } from "bun:test";
import {
  computeMatchWinnerCloseTime,
  computeMatchWinnerMarketKey,
  getXLayerInfraDeployment,
  getXLayerMarketDeployment,
  listXLayerMarketDeployments,
  matchWinnerResolutionPolicyHash,
  XLAYER_DEPLOYMENTS,
  XLAYER_MATCH_WINNER_CLOSE_BUFFER_SECONDS,
  XLAYER_MATCH_WINNER_RESOLUTION_POLICY_CODE,
} from "./deployments";
import { keccak256, toBytes } from "viem";

test("XLAYER_DEPLOYMENTS exposes X Layer testnet network info", () => {
  expect(XLAYER_DEPLOYMENTS.network.chainId).toBe(1952);
  expect(XLAYER_DEPLOYMENTS.network.name).toBe("X Layer Testnet");
  expect(XLAYER_DEPLOYMENTS.network.rpcUrl.startsWith("https://")).toBe(true);
});

test("computeMatchWinnerMarketKey matches buildMatchWinnerMarketDefinition windowKey", () => {
  const fixtureId = "fixture:worldcup-2026-001";
  expect(computeMatchWinnerMarketKey(fixtureId)).toBe(`fixture:${fixtureId}:match_winner`);
});

test("computeMatchWinnerCloseTime is kickoff + 105 minutes in unix seconds", () => {
  const kickoffUtc = "2026-06-11T12:00:00.000Z";
  const expected = Math.floor(Date.UTC(2026, 5, 11, 12, 0, 0) / 1000) + XLAYER_MATCH_WINNER_CLOSE_BUFFER_SECONDS;
  expect(computeMatchWinnerCloseTime(kickoffUtc)).toBe(expected);
  expect(XLAYER_MATCH_WINNER_CLOSE_BUFFER_SECONDS).toBe(105 * 60);
});

test("computeMatchWinnerCloseTime rejects invalid kickoff", () => {
  expect(() => computeMatchWinnerCloseTime("not-a-date")).toThrow();
});

test("matchWinnerResolutionPolicyHash hashes the resolution rule code string", () => {
  const expected = keccak256(toBytes(XLAYER_MATCH_WINNER_RESOLUTION_POLICY_CODE));
  expect(matchWinnerResolutionPolicyHash()).toBe(expected);
  expect(XLAYER_MATCH_WINNER_RESOLUTION_POLICY_CODE).toBe(
    "full_time_match_winner_excluding_extra_time_and_penalties",
  );
});

test("getXLayerMarketDeployment returns undefined when no markets are deployed", () => {
  expect(getXLayerMarketDeployment("fixture:fixture:worldcup-2026-001:match_winner")).toBeUndefined();
});

test("listXLayerMarketDeployments returns an array (possibly empty)", () => {
  expect(Array.isArray(listXLayerMarketDeployments())).toBe(true);
});

test("getXLayerInfraDeployment returns null when infra is not yet deployed", () => {
  expect(getXLayerInfraDeployment()).toBeNull();
});
