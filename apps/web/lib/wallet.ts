export type WalletView = {
  connected: boolean;
  chainId?: number;
  address?: `0x${string}`;
};

export function walletStatusLabel(wallet: WalletView, expectedChainId = 31337): string {
  if (!wallet.connected) return "Connect wallet";
  if (wallet.chainId !== expectedChainId) return "Wrong network";
  return `Connected ${wallet.address?.slice(0, 6) ?? "wallet"}`;
}

export function canTrade(wallet: WalletView, marketStatus: string): boolean {
  return wallet.connected && wallet.chainId === 31337 && (marketStatus === "live_trading" || marketStatus === "closing_soon");
}
