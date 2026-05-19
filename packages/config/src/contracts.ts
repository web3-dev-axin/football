export type ContractAddresses = {
  mockUsdc?: `0x${string}`;
  ctf?: `0x${string}`;
  marketFactory?: `0x${string}`;
  oracle?: `0x${string}`;
};

export function getContractAddresses(env: NodeJS.ProcessEnv = process.env): ContractAddresses {
  return {
    mockUsdc: env.MOCK_USDC_ADDRESS as `0x${string}` | undefined,
    ctf: env.CTF_ADDRESS as `0x${string}` | undefined,
    marketFactory: env.MARKET_FACTORY_ADDRESS as `0x${string}` | undefined,
    oracle: env.ORACLE_ADDRESS as `0x${string}` | undefined,
  };
}
