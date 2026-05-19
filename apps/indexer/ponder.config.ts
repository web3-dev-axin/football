import { getContractAddresses, anvilChain } from "@worldcup/config";

const addresses = getContractAddresses();

export default {
  networks: {
    anvil: {
      chainId: anvilChain.id,
      transport: anvilChain.rpcUrl,
    },
  },
  contracts: {
    WorldCupMarketFactory: {
      network: "anvil",
      address: addresses.marketFactory ?? "0x0000000000000000000000000000000000000000",
      startBlock: Number(process.env.PONDER_START_BLOCK ?? 0),
    },
    WorldCupMarket: {
      network: "anvil",
      address: addresses.marketFactory ?? "0x0000000000000000000000000000000000000000",
      startBlock: Number(process.env.PONDER_START_BLOCK ?? 0),
    },
    OptimisticResultOracle: {
      network: "anvil",
      address: addresses.oracle ?? "0x0000000000000000000000000000000000000000",
      startBlock: Number(process.env.PONDER_START_BLOCK ?? 0),
    },
  },
};
