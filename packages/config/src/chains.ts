import { DEFAULT_CHAIN_ID } from "@polygoal/shared";

export const anvilChain = {
  id: DEFAULT_CHAIN_ID,
  name: "Anvil",
  rpcUrl: process.env.RPC_URL ?? "http://localhost:8545",
} as const;
