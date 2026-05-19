import deploymentsData from "../../../deployments/xlayer-testnet.json" with { type: "json" };
import { keccak256, toBytes, type Hex } from "viem";

export type XLayerNetworkInfo = {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
};

export type XLayerInfraDeployment = {
  deployedAt: string;
  deployer: `0x${string}`;
  mockUsdc: `0x${string}`;
  ctf: `0x${string}`;
  oracle: `0x${string}`;
  marketFactory: `0x${string}`;
  txHashes: {
    mockUsdc: Hex;
    ctf: Hex;
    oracle: Hex;
    marketFactory: Hex;
    transferCtfOwnership: Hex;
  };
};

export type XLayerMarketDeployment = {
  fixtureId: string;
  fifaMatchId: string;
  matchNumber: number;
  marketType: "match_winner";
  outcomeCount: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAtUtc: string;
  closeTimeUnix: number;
  marketAddress: `0x${string}`;
  marketId: Hex;
  conditionId: Hex;
  resolutionPolicyHash: Hex;
  txHash: Hex;
  blockNumber: number;
};

export type XLayerDeployments = {
  network: XLayerNetworkInfo;
  infra: XLayerInfraDeployment | null;
  markets: Record<string, XLayerMarketDeployment>;
};

export const XLAYER_DEPLOYMENTS: XLayerDeployments = deploymentsData as XLayerDeployments;

export const XLAYER_MATCH_WINNER_RESOLUTION_POLICY_CODE =
  "full_time_match_winner_excluding_extra_time_and_penalties" as const;

export const XLAYER_MATCH_WINNER_CLOSE_BUFFER_SECONDS = 105 * 60;

export const XLAYER_MATCH_WINNER_OUTCOME_COUNT = 3;

export const XLAYER_MATCH_WINNER_WINDOW_START_SECOND = 0;
export const XLAYER_MATCH_WINNER_WINDOW_END_SECOND = 5400;

export function computeMatchWinnerMarketKey(fixtureId: string): string {
  return `fixture:${fixtureId}:match_winner`;
}

export function computeMatchWinnerCloseTime(kickoffAtUtc: string): number {
  const ms = Date.parse(kickoffAtUtc);
  if (Number.isNaN(ms)) throw new Error(`Invalid kickoff timestamp: ${kickoffAtUtc}`);
  return Math.floor(ms / 1000) + XLAYER_MATCH_WINNER_CLOSE_BUFFER_SECONDS;
}

export function matchWinnerResolutionPolicyHash(): Hex {
  return keccak256(toBytes(XLAYER_MATCH_WINNER_RESOLUTION_POLICY_CODE));
}

export function getXLayerInfraDeployment(): XLayerInfraDeployment | null {
  return XLAYER_DEPLOYMENTS.infra;
}

export function getXLayerMarketDeployment(marketKey: string): XLayerMarketDeployment | undefined {
  return XLAYER_DEPLOYMENTS.markets[marketKey];
}

export function listXLayerMarketDeployments(): XLayerMarketDeployment[] {
  return Object.values(XLAYER_DEPLOYMENTS.markets);
}
