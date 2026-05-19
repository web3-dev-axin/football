import { createPublicClient, http } from "viem";
import { foundry } from "viem/chains";

export function createAnvilPublicClient(rpcUrl = "http://localhost:8545") {
  return createPublicClient({ chain: foundry, transport: http(rpcUrl) });
}
