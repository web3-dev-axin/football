import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import FactoryAbiJson from "./abis/WorldCupMarketFactory.json" with { type: "json" };
import MarketAbiJson from "./abis/WorldCupMarket.json" with { type: "json" };
import OracleAbiJson from "./abis/OptimisticResultOracle.json" with { type: "json" };
import xlayerDeployment from "../../deployments/xlayer-testnet.json" with { type: "json" };

const FACTORY_ADDRESS = xlayerDeployment.infra.marketFactory as `0x${string}`;
const ORACLE_ADDRESS = xlayerDeployment.infra.oracle as `0x${string}`;

// Factory deploy tx 0xbc057eb…3b943f → block 30743211. Override with PONDER_START_BLOCK
// if you want a tighter window during development.
const DEFAULT_START_BLOCK = 30_743_211;
const START_BLOCK = Number(process.env.PONDER_START_BLOCK ?? DEFAULT_START_BLOCK);

const RPC_URL =
  process.env.PONDER_RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  process.env.RPC_URL ??
  "https://testrpc.xlayer.tech/terigon";

const FACTORY_ABI = FactoryAbiJson.abi as readonly unknown[];
const MARKET_ABI = MarketAbiJson.abi as readonly unknown[];
const ORACLE_ABI = OracleAbiJson.abi as readonly unknown[];

const MARKET_CREATED_EVENT = parseAbiItem(
  "event MarketCreated(bytes32 indexed marketId, string marketKey, string fixtureId, uint256 windowStartMatchSecond, uint256 windowEndMatchSecond, address market, bytes32 conditionId, uint256 outcomeCount)",
);

export default createConfig({
  database: process.env.DATABASE_URL
    ? {
        kind: "postgres",
        connectionString: process.env.DATABASE_URL,
      }
    : { kind: "pglite" },
  chains: {
    xlayer: {
      id: 1952,
      rpc: RPC_URL,
    },
  },
  contracts: {
    WorldCupMarketFactory: {
      chain: "xlayer",
      address: FACTORY_ADDRESS,
      startBlock: START_BLOCK,
      // biome-ignore lint/suspicious/noExplicitAny: forge JSON ABI lacks Ponder's exact type
      abi: FACTORY_ABI as any,
    },
    WorldCupMarket: {
      chain: "xlayer",
      address: factory({
        address: FACTORY_ADDRESS,
        event: MARKET_CREATED_EVENT,
        parameter: "market",
      }),
      startBlock: START_BLOCK,
      // biome-ignore lint/suspicious/noExplicitAny: forge JSON ABI lacks Ponder's exact type
      abi: MARKET_ABI as any,
    },
    OptimisticResultOracle: {
      chain: "xlayer",
      address: ORACLE_ADDRESS,
      startBlock: START_BLOCK,
      // biome-ignore lint/suspicious/noExplicitAny: forge JSON ABI lacks Ponder's exact type
      abi: ORACLE_ABI as any,
    },
  },
});
