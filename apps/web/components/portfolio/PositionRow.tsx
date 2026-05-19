"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Market } from "@polygoal/shared";
import { Card } from "@heroui/react";
import { createBrowserWalletClient, redeemOutcome, refundOutcome } from "@polygoal/sdk";
import { APP_CHAIN, APP_VIEM_CHAIN, injectedEthereum } from "../../lib/wallet";
import { useWallet } from "../wallet/WalletProvider";
import { TxStatusBadge, type TxStatus } from "../ui/TxStatusBadge";
import { formatUsdc, marketHref, statusLabel, displayStatusForMarket } from "../../lib/market-copy";
import { colorForOutcome } from "../../lib/outcome-colors";

export type AggregatedPosition = {
  marketId: string;
  outcomeIndex: number;
  outcomeLabel: string;
  sharesRaw: string;
  collateralInRaw: string;
  market: Market;
};

type ClaimedRecord = {
  kind: "redeem" | "refund";
  txHash?: string;
  amountRaw: string;
  at: number;
};

export function PositionRow({ position, action }: { position: AggregatedPosition; action: "redeem" | "refund" | "none" }) {
  const { wallet } = useWallet();
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [claimed, setClaimed] = useState<ClaimedRecord | undefined>(undefined);

  const status = displayStatusForMarket(position.market);
  const commercialType = inferCommercialType(position.market.id);
  const outcomeColor = colorForOutcome(commercialType, position.outcomeIndex, position.market.outcomes.length);
  const shares = Number(BigInt(position.sharesRaw)) / 1_000_000;
  const cost = Number(BigInt(position.collateralInRaw)) / 1_000_000;
  const avgEntry = shares > 0 ? cost / shares : 0;
  const probabilityBps = position.market.outcomes.find((o) => o.outcomeIndex === position.outcomeIndex)?.probabilityBps ?? 0;
  const currentValue = shares * (probabilityBps / 10_000);
  const showProbability = action === "none" && (status === "live" || status === "opening");
  const showPnl = action === "none" && cost > 0 && currentValue > 0;
  const pnlDelta = currentValue - cost;
  const pnlPct = cost > 0 ? (pnlDelta / cost) * 100 : 0;

  const claimedKey = wallet.address ? claimedStorageKey(wallet.address, position) : undefined;
  useEffect(() => {
    if (!claimedKey) return;
    try {
      const raw = window.localStorage.getItem(claimedKey);
      if (raw) setClaimed(JSON.parse(raw) as ClaimedRecord);
    } catch {
      // localStorage may be unavailable (private browsing); silently ignore
    }
  }, [claimedKey]);

  function persistClaimed(record: ClaimedRecord) {
    setClaimed(record);
    if (!claimedKey) return;
    try { window.localStorage.setItem(claimedKey, JSON.stringify(record)); } catch { /* ignore */ }
  }

  async function handleAction() {
    if (!wallet.connected || !wallet.address) { setError("Connect wallet first"); return; }
    if (!position.market.marketAddress) { setError("Market is not deployed on chain yet"); return; }
    const provider = injectedEthereum();
    if (!provider) { setError("Browser wallet unavailable"); return; }
    setError(undefined);
    setTxStatus("submitting");
    try {
      const walletClient = createBrowserWalletClient(provider, APP_VIEM_CHAIN);
      const sharesAmountRaw = BigInt(position.sharesRaw);
      const writer = action === "refund" ? refundOutcome : redeemOutcome;
      const hash = await writer({ walletClient, account: wallet.address, marketAddress: position.market.marketAddress, outcomeIndex: position.outcomeIndex, sharesAmountRaw });
      setTxHash(hash);
      setTxStatus("success");
      persistClaimed({
        kind: action === "refund" ? "refund" : "redeem",
        txHash: hash,
        amountRaw: position.sharesRaw,
        at: Date.now(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transaction failed");
      setTxStatus("failed");
    }
  }

  const isClaimedAction = action === "redeem" || action === "refund";
  const isClaimed = Boolean(claimed) && isClaimedAction;
  const claimVerbDone = claimed?.kind === "refund" ? "Refunded" : "Claimed";
  const cardClasses = ["position-card", isClaimed ? "is-claimed" : ""].filter(Boolean).join(" ");

  return (
    <li className="position-card-item" style={{ ["--outcome-color" as string]: outcomeColor }}>
      <Card variant="default" className={cardClasses}>
        <span className="position-card-stripe" aria-hidden />

        <Card.Header className="position-card-header">
          <Link className="position-card-head" href={marketHref(position.marketId)} prefetch={false}>
            <Card.Title className="position-card-fixture">{position.market.title}</Card.Title>
            <span className="position-card-outcome">
              <span className="outcome-dot" aria-hidden />
              <span className="position-card-outcome-label">{position.outcomeLabel}</span>
            </span>
          </Link>
          <span className={`position-card-status state-${status}`}>
            {isClaimed ? claimVerbDone : statusLabel(status)}
          </span>
        </Card.Header>

        <Card.Content className="position-card-content">
          <dl className="position-card-stats">
            <div>
              <dt>Shares</dt>
              <dd>{shares.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Cost basis</dt>
              <dd>{formatUsdc(position.collateralInRaw)}</dd>
            </div>
            <div>
              <dt>
                {isClaimed
                  ? claimVerbDone
                  : action === "redeem" ? "Payout"
                  : action === "refund" ? "Refundable"
                  : "Current value"}
              </dt>
              <dd>
                <span className={isClaimed ? "value-claimed" : undefined}>
                  {formatUsdc(claimed?.amountRaw ?? position.sharesRaw)}
                </span>
                {isClaimed ? <span className="pnl pnl-up">Settled</span> : null}
                {!isClaimed && showPnl ? (
                  <span className={`pnl ${pnlDelta >= 0 ? "pnl-up" : "pnl-down"}`}>
                    {pnlDelta >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                  </span>
                ) : null}
              </dd>
            </div>
            {!isClaimed && showProbability && avgEntry > 0 ? (
              <div>
                <dt>Avg / implied</dt>
                <dd className="kpi-pair">
                  <small>{formatUsdc(BigInt(Math.round(avgEntry * 1_000_000)))}</small>
                  <small className="position-card-implied">{Math.round(probabilityBps / 100)}%</small>
                </dd>
              </div>
            ) : null}
          </dl>
        </Card.Content>

        <Card.Footer className="position-card-footer">
          {isClaimed ? (
            <>
              <span className="badge tx-success position-card-claim-pill" role="status">
                ✓ {claimVerbDone}
              </span>
              {claimed?.txHash && APP_CHAIN.blockExplorerUrls[0] ? (
                <a
                  className="position-card-tx-link"
                  href={`${APP_CHAIN.blockExplorerUrls[0]}/tx/${claimed.txHash}`}
                  target="_blank"
                  rel="noopener"
                >
                  View transaction ↗
                </a>
              ) : null}
            </>
          ) : action === "redeem" ? (
            <button type="button" className="button position-card-button" onClick={() => void handleAction()} disabled={txStatus === "submitting"}>
              {txStatus === "submitting" ? "Confirming…" : "Redeem"}
            </button>
          ) : action === "refund" ? (
            <button type="button" className="button secondary position-card-button" onClick={() => void handleAction()} disabled={txStatus === "submitting"}>
              {txStatus === "submitting" ? "Confirming…" : "Refund"}
            </button>
          ) : (
            <Link className="button ghost position-card-button" href={marketHref(position.marketId)} prefetch={false}>
              View market
            </Link>
          )}
          {!isClaimed ? (
            <TxStatusBadge status={txStatus} txHash={txHash} explorerUrl={APP_CHAIN.blockExplorerUrls[0]} />
          ) : null}
          {error ? <p className="kpi trade-ticket-error" role="alert">{error}</p> : null}
        </Card.Footer>
      </Card>
    </li>
  );
}

function claimedStorageKey(wallet: string, position: AggregatedPosition): string {
  return `polygoal:claimed:${APP_CHAIN.id}:${wallet.toLowerCase()}:${position.marketId}:${position.outcomeIndex}`;
}

/** Market ids look like `fixture:<fixtureId>:<commercialType>` for commercial markets. */
function inferCommercialType(marketId: string): string | undefined {
  if (!marketId.startsWith("fixture:")) return undefined;
  const parts = marketId.split(":");
  return parts[parts.length - 1];
}
