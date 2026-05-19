import { StatCard } from "../ui/StatCard";
import { formatUsdc } from "../../lib/market-copy";

export function PortfolioSummary({ openPositions, lockedRaw, redeemableRaw, settledRaw }: { openPositions: number; lockedRaw: string; redeemableRaw: string; settledRaw: string }) {
  return (
    <div className="portfolio-summary">
      <StatCard label="Open positions" value={String(openPositions)} helper="Across all open markets" />
      <StatCard label="Locked collateral" value={formatUsdc(lockedRaw)} helper="USDC tied up in live markets" />
      <StatCard label="Redeemable" value={formatUsdc(redeemableRaw)} helper="Ready to claim from won outcomes" />
      <StatCard label="Settled value" value={formatUsdc(settledRaw)} helper="Lifetime payouts received" />
    </div>
  );
}
