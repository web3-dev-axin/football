"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Market, Trade } from "@polygoal/shared";
import { Card } from "@heroui/react";
import { useWallet } from "../wallet/WalletProvider";
import { PortfolioSummary } from "./PortfolioSummary";
import { PositionGroup } from "./PositionGroup";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { consumerApi } from "../../lib/api-client";
import type { AggregatedPosition } from "./PositionRow";
import { displayStatusForMarket } from "../../lib/market-copy";

function isAddress(value: string | null | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
}

export function PortfolioPageClient() {
  const { wallet, status, connect } = useWallet();
  const searchParams = useSearchParams();
  const viewerAddressParam = searchParams?.get("as") ?? null;
  const viewerAddress = isAddress(viewerAddressParam) ? viewerAddressParam : null;

  // Effective address: ?as= takes precedence (read-only viewer), otherwise the
  // connected wallet's own address.
  const effectiveAddress = viewerAddress ?? (wallet.connected ? wallet.address : undefined);

  const [positions, setPositions] = useState<AggregatedPosition[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!effectiveAddress) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const { positions: trades } = await consumerApi.getPortfolio(effectiveAddress);
        const aggregated = await aggregatePositions(trades);
        if (!cancelled) setPositions(aggregated);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load portfolio");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveAddress]);

  const grouped = useMemo(() => groupPositions(positions ?? []), [positions]);

  if (!effectiveAddress) {
    return (
      <EmptyState
        icon="🔑"
        title="Connect your wallet to see your positions"
        description="We never store your wallet address. Positions are read straight from on-chain conditional tokens."
        action={
          status !== "connected" ? (
            <button type="button" className="button" onClick={() => void connect()}>Connect wallet</button>
          ) : undefined
        }
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        tone="error"
        icon="⚠"
        title="Could not load positions"
        description={error}
        action={<Link className="button secondary" href="/portfolio">Retry</Link>}
      />
    );
  }

  // Locked = USDC the user actually paid into live/awaiting positions (net of any sells)
  const totalLockedRaw = grouped.live.reduce((acc, p) => acc + BigInt(p.collateralInRaw), 0n)
    + grouped.awaiting.reduce((acc, p) => acc + BigInt(p.collateralInRaw), 0n);
  // Redeemable / Settled = share count (each share pays 1 USDC if it was the winning outcome)
  const totalRedeemableRaw = grouped.redeemable.reduce((acc, p) => acc + BigInt(p.sharesRaw), 0n);
  const totalSettledRaw = grouped.settled.reduce((acc, p) => acc + BigInt(p.sharesRaw), 0n);

  return (
    <>
      {viewerAddress ? (
        <Card variant="default" className="stack" role="status" aria-live="polite" style={{ borderColor: "var(--color-accent, #4a90e2)" }}>
          <p className="kpi">
            Viewing read-only portfolio for <strong style={{ fontFamily: "var(--font-mono, monospace)" }}>{`${viewerAddress.slice(0, 6)}…${viewerAddress.slice(-4)}`}</strong>.{" "}
            <Link href="/portfolio" className="link">Switch to your own wallet</Link>
          </p>
        </Card>
      ) : null}
      <PortfolioSummary
        openPositions={(positions?.length ?? 0)}
        lockedRaw={totalLockedRaw.toString()}
        redeemableRaw={totalRedeemableRaw.toString()}
        settledRaw={totalSettledRaw.toString()}
      />
      {isLoading && !positions ? (
        <Card variant="default" className="stack" aria-busy="true" aria-label="Loading positions">
          <Skeleton height={20} width={200} />
          <Skeleton height={56} radius={12} />
          <Skeleton height={56} radius={12} />
          <Skeleton height={56} radius={12} />
        </Card>
      ) : null}
      <PositionGroup
        title="Live"
        description="Markets currently trading"
        positions={grouped.live}
        action="none"
        emptyIcon="🟢"
        emptyTitle="No live positions"
        emptyDescription="You don't hold any shares in markets that are currently trading."
        emptyAction={<Link className="button secondary" href="/">Browse live markets</Link>}
      />
      <PositionGroup
        title="Awaiting result"
        description="Closed and waiting for the oracle"
        positions={grouped.awaiting}
        action="none"
        emptyIcon="⏳"
        emptyTitle="No positions awaiting settlement"
        emptyDescription="Markets you hold show up here while the oracle proposes and finalizes the result."
      />
      <PositionGroup
        title="Redeemable now"
        description="Click redeem to claim winning shares"
        positions={grouped.redeemable}
        action="redeem"
      />
      <PositionGroup
        title="Voided / refunds"
        description="Markets that were voided. Refund unused collateral here."
        positions={grouped.voided}
        action="refund"
      />
      <PositionGroup
        title="Settled"
        description="Closed positions and history"
        positions={grouped.settled}
        action="none"
        emptyIcon="📜"
        emptyTitle="No settled positions yet"
        emptyDescription="Once a market settles your share history is preserved here."
      />
    </>
  );
}

async function aggregatePositions(trades: Trade[]): Promise<AggregatedPosition[]> {
  const byKey = new Map<string, { marketId: string; outcomeIndex: number; sharesRaw: bigint; collateralInRaw: bigint }>();
  for (const trade of trades) {
    const key = `${trade.marketId}:${trade.outcomeIndex}`;
    const existing = byKey.get(key) ?? { marketId: trade.marketId, outcomeIndex: trade.outcomeIndex, sharesRaw: 0n, collateralInRaw: 0n };
    const sign = trade.tradeType === "buy" ? 1n : -1n;
    existing.sharesRaw += sign * BigInt(trade.sharesAmountRaw);
    existing.collateralInRaw += sign * BigInt(trade.collateralAmountRaw);
    byKey.set(key, existing);
  }

  const marketIds = [...new Set(trades.map((t) => t.marketId))];
  const markets = await Promise.all(marketIds.map(async (id) => {
    try { return await consumerApi.getMarket(id); } catch { return undefined; }
  }));
  const marketsById = new Map<string, Market>();
  for (const m of markets) if (m) marketsById.set(m.id, m);

  const positions: AggregatedPosition[] = [];
  for (const [, value] of byKey.entries()) {
    if (value.sharesRaw <= 0n) continue;
    const market = marketsById.get(value.marketId);
    if (!market) continue;
    const outcome = market.outcomes.find((o) => o.outcomeIndex === value.outcomeIndex);
    positions.push({
      marketId: value.marketId,
      outcomeIndex: value.outcomeIndex,
      outcomeLabel: outcome?.label ?? `Outcome ${value.outcomeIndex}`,
      sharesRaw: value.sharesRaw.toString(),
      collateralInRaw: value.collateralInRaw.toString(),
      market,
    });
  }
  return positions;
}

function groupPositions(positions: AggregatedPosition[]) {
  const groups = { live: [] as AggregatedPosition[], awaiting: [] as AggregatedPosition[], redeemable: [] as AggregatedPosition[], voided: [] as AggregatedPosition[], settled: [] as AggregatedPosition[] };
  for (const position of positions) {
    const status = displayStatusForMarket(position.market);
    if (status === "live" || status === "opening") groups.live.push(position);
    else if (status === "awaiting" || status === "settling" || status === "disputed") groups.awaiting.push(position);
    else if (status === "voided") groups.voided.push(position);
    else if (position.market.status === "redeemable" || position.market.oracleState === "finalized") {
      // Finalized market: if the user holds the winning outcome they can
      // redeem; otherwise the position is settled (historical record only).
      const winning = position.market.winningOutcome;
      if (winning !== undefined && position.outcomeIndex !== winning) {
        groups.settled.push(position);
      } else {
        groups.redeemable.push(position);
      }
    } else {
      groups.settled.push(position);
    }
  }
  return groups;
}
