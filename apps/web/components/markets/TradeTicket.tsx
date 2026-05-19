"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { Market } from "@polygoal/shared";
import {
  approveUsdc,
  buyOutcome,
  createBrowserWalletClient,
  createRpcPublicClient,
  parseRawAmount,
  readAllowance,
  readMarketConditionId,
  readPositionBalance,
  readUsdcBalance,
  sellOutcome,
} from "@polygoal/sdk";
import { APP_CHAIN, APP_VIEM_CHAIN, injectedEthereum } from "../../lib/wallet";
import { consumerApi, humanizeApiError } from "../../lib/api-client";
import { useWallet } from "../wallet/WalletProvider";
import { TxStatusBadge, type TxStatus } from "../ui/TxStatusBadge";
import { colorForOutcome } from "../../lib/outcome-colors";

type Mode = "buy" | "sell";

type Props = {
  market: Market;
  selectedOutcomeIndex: number;
  onTradeComplete?: () => void;
  onOutcomeChange?: (outcomeIndex: number) => void;
};

function contractAddress(label: string, value: string | undefined): `0x${string}` {
  if (value?.startsWith("0x") && value.length === 42) return value as `0x${string}`;
  throw new Error(`${label} contract address is not configured`);
}

function isTradingOpen(status: string): boolean {
  return status === "live_trading" || status === "closing_soon" || status === "scheduled";
}

function tradingPhase(status: string): "pre_match" | "live" | "closing" | "closed" {
  if (status === "scheduled") return "pre_match";
  if (status === "closing_soon") return "closing";
  if (status === "live_trading") return "live";
  return "closed";
}

const BUY_PRESETS = ["10", "50", "100", "500"] as const;

export function TradeTicket({ market, selectedOutcomeIndex, onTradeComplete, onOutcomeChange }: Props) {
  const { wallet, status, connect, switchNetwork } = useWallet();
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("100");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [allowanceRaw, setAllowanceRaw] = useState<bigint>(0n);
  const [sharesByOutcome, setSharesByOutcome] = useState<Record<number, bigint>>({});
  const [usdcBalanceRaw, setUsdcBalanceRaw] = useState<bigint>(0n);
  const [riskBlocked, setRiskBlocked] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const outcome = market.outcomes.find((o) => o.outcomeIndex === selectedOutcomeIndex) ?? market.outcomes[0];
  const tradingOpen = isTradingOpen(market.status);
  const phase = tradingPhase(market.status);
  const marketKind: "match_winner" | "exact_score" = market.outcomes.length === 3 ? "match_winner" : "exact_score";
  const outcomeColor = outcome ? colorForOutcome(marketKind, outcome.outcomeIndex, market.outcomes.length) : "var(--color-brand)";

  const amountRaw = useMemo(() => {
    try {
      return parseRawAmount(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  const usdcAddress = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS;
  const ctfAddress = process.env.NEXT_PUBLIC_CTF_ADDRESS;

  const outcomeIndexes = useMemo(() => market.outcomes.map((o) => o.outcomeIndex), [market.outcomes]);

  const refreshChainState = useCallback(async () => {
    if (!wallet.connected || !wallet.address || !market.marketAddress || !usdcAddress || !ctfAddress) return;
    try {
      const publicClient = createRpcPublicClient(APP_VIEM_CHAIN, APP_CHAIN.rpcUrls[0] ?? "");
      const usdcAddr = contractAddress("USDC", usdcAddress);
      const ctfAddr = contractAddress("CTF", ctfAddress);
      const [allowance, conditionId, balance] = await Promise.all([
        readAllowance(publicClient, { usdcAddress: usdcAddr, owner: wallet.address, spender: market.marketAddress }),
        readMarketConditionId(publicClient, market.marketAddress),
        readUsdcBalance(publicClient, { usdcAddress: usdcAddr, owner: wallet.address }),
      ]);
      const shareEntries = await Promise.all(
        outcomeIndexes.map(async (idx) => {
          const shares = await readPositionBalance(publicClient, { ctfAddress: ctfAddr, conditionId, outcomeIndex: idx, owner: wallet.address! });
          return [idx, shares] as const;
        }),
      );
      setAllowanceRaw(allowance);
      setSharesByOutcome(Object.fromEntries(shareEntries));
      setUsdcBalanceRaw(balance);
    } catch {
      // chain not reachable, leave defaults
    }
  }, [wallet.connected, wallet.address, market.marketAddress, usdcAddress, ctfAddress, outcomeIndexes]);

  const sharesHeldRaw = sharesByOutcome[outcome?.outcomeIndex ?? -1] ?? 0n;
  const heldOutcomes = market.outcomes
    .map((o) => ({ outcome: o, sharesRaw: sharesByOutcome[o.outcomeIndex] ?? 0n }))
    .filter((entry) => entry.sharesRaw > 0n);

  useEffect(() => {
    void refreshChainState();
  }, [refreshChainState]);

  useEffect(() => {
    setRiskBlocked(undefined);
    if (!market.id || amountRaw === 0n) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const decision = await consumerApi.checkRisk({
          marketId: market.id,
          userExposureRaw: "0",
          marketVolumeRaw: market.volumeRaw,
          orderAmountRaw: amountRaw.toString(),
        });
        if (cancelled) return;
        if (!decision.allowed) {
          setRiskBlocked(humanizeApiError(new (await import("../../lib/api-client")).ApiClientError(409, decision.reason ?? "Risk check rejected", decision.reason)));
        }
      } catch {
        // ignore network errors here, just enable
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [amountRaw, market.id, market.volumeRaw]);

  const notDeployed = !market.marketAddress;
  const needsApproval = mode === "buy" && wallet.connected && amountRaw > allowanceRaw;
  const insufficientShares = mode === "sell" && wallet.connected && amountRaw > sharesHeldRaw;
  const insufficientBalance = mode === "buy" && wallet.connected && amountRaw > usdcBalanceRaw;
  const price = outcome ? outcome.probabilityBps / 10_000 : 0;
  const parsedAmount = Number(amount || "0");
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleBuy(usdcAddr: `0x${string}`, marketAddr: `0x${string}`) {
    const provider = injectedEthereum();
    if (!provider || !wallet.address) throw new Error("Wallet unavailable");
    const walletClient = createBrowserWalletClient(provider, APP_VIEM_CHAIN);
    const publicClient = createRpcPublicClient(APP_VIEM_CHAIN, APP_CHAIN.rpcUrls[0] ?? "");
    if (needsApproval) {
      setTxStatus("approving");
      const approvalHash = await approveUsdc({ walletClient, account: wallet.address, usdcAddress: usdcAddr, spender: marketAddr, amountRaw });
      setTxHash(approvalHash);
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
    }
    setTxStatus("submitting");
    const hash = await buyOutcome({ walletClient, account: wallet.address, marketAddress: marketAddr, outcomeIndex: outcome?.outcomeIndex ?? 0, collateralAmountRaw: amountRaw, minSharesOutRaw: 1n });
    setTxHash(hash);
    setTxStatus("confirming");
  }

  async function handleSell(marketAddr: `0x${string}`) {
    const provider = injectedEthereum();
    if (!provider || !wallet.address) throw new Error("Wallet unavailable");
    const walletClient = createBrowserWalletClient(provider, APP_VIEM_CHAIN);
    setTxStatus("submitting");
    const hash = await sellOutcome({ walletClient, account: wallet.address, marketAddress: marketAddr, outcomeIndex: outcome?.outcomeIndex ?? 0, sharesAmountRaw: amountRaw, minCollateralOutRaw: 1n });
    setTxHash(hash);
    setTxStatus("confirming");
  }

  async function handleSubmit() {
    setErrorMessage(undefined);
    setTxHash(undefined);
    if (notDeployed) return;
    if (!wallet.connected) { await connect(); return; }
    if (status === "wrong-network") { await switchNetwork(); return; }
    if (riskBlocked) { setErrorMessage(riskBlocked); return; }
    if (!market.marketAddress) { setErrorMessage("Market is not deployed on chain yet."); return; }
    if (amountRaw === 0n) { setErrorMessage("Enter an amount greater than zero."); return; }
    if (insufficientShares) { setErrorMessage(`You only hold ${formatShares(sharesHeldRaw)} ${outcome?.label} shares.`); return; }
    if (insufficientBalance) {
      setErrorMessage(`Insufficient USDC balance. You have ${formatUsdcFromRaw(usdcBalanceRaw)} USDC. Mint more from the Portfolio page.`);
      return;
    }
    try {
      const usdcAddr = contractAddress("USDC", usdcAddress);
      const marketAddr = market.marketAddress;
      if (mode === "buy") await handleBuy(usdcAddr, marketAddr);
      else await handleSell(marketAddr);
      setTxStatus("success");
      startTransition(() => onTradeComplete?.());
      setTimeout(() => void refreshChainState(), 2000);
    } catch (error) {
      setErrorMessage(humanizeTradeError(error));
      setTxStatus("failed");
    }
  }

  const ctaLabel = notDeployed
    ? "Coming soon"
    : insufficientBalance
      ? "Insufficient USDC"
      : ctaLabelFor({ status, mode, outcomeLabel: outcome?.label, tradingOpen, needsApproval, riskBlocked, insufficientShares, amount, sharesHeldRaw });
  const ctaDisabled = notDeployed || status === "connecting" || !tradingOpen || Boolean(riskBlocked) || (mode === "sell" && insufficientShares) || (mode === "buy" && insufficientBalance) || amountRaw === 0n;
  // Sell tab is enabled as long as the wallet holds at least one outcome's shares in this market.
  // Per-outcome guidance is shown inside the panel when the currently selected outcome has none.
  const sellDisabled = notDeployed || heldOutcomes.length === 0;
  const sellWrongOutcome = mode === "sell" && sharesHeldRaw === 0n && heldOutcomes.length > 0;

  function setMaxAmount() {
    if (mode === "sell") {
      if (sharesHeldRaw > 0n) setAmount(formatShares(sharesHeldRaw));
      return;
    }
    setAmount("500");
  }

  return (
    <form
      className="trade-ticket"
      style={{ "--outcome-color": outcomeColor } as React.CSSProperties}
      onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}
    >
      <header className="trade-ticket-head">
        <TradePhaseHint phase={phase} />
      </header>

      <div className="trade-segment" role="tablist" aria-label="Trade direction">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "buy"}
          className={`trade-segment-btn buy${mode === "buy" ? " active" : ""}`}
          onClick={() => setMode("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sell"}
          className={`trade-segment-btn sell${mode === "sell" ? " active" : ""}`}
          onClick={() => setMode("sell")}
          disabled={sellDisabled}
          title={sellDisabled ? "You don't hold any shares in this market yet" : undefined}
        >
          Sell
        </button>
      </div>

      <div className="trade-outcome-chip">
        <span className="trade-outcome-dot" aria-hidden />
        <div className="trade-outcome-text">
          <span className="trade-outcome-eyebrow">{mode === "buy" ? "You're backing" : "You're selling"}</span>
          <strong>{outcome?.label ?? "—"}</strong>
        </div>
        <div className="trade-outcome-price">
          <small>{mode === "buy" ? "Price" : "Value"}</small>
          <strong>${price.toFixed(2)}</strong>
        </div>
      </div>

      {notDeployed ? (
        <p className="trade-alert preview" role="status">
          Preview only · this pool isn't on chain yet. Provider odds shown for reference.
        </p>
      ) : null}

      {sellWrongOutcome ? (
        <div className="trade-switch-outcome" role="status">
          <div>
            <strong>You don't hold {outcome?.label} shares yet.</strong>
            <p className="kpi">You hold{" "}
              {heldOutcomes.map((entry, idx) => (
                <span key={entry.outcome.outcomeIndex}>
                  {idx > 0 ? ", " : ""}
                  <strong>{formatShares(entry.sharesRaw)} {entry.outcome.label}</strong>
                </span>
              ))} in this market.
            </p>
          </div>
          <div className="trade-switch-outcome-actions">
            {heldOutcomes.map((entry) => (
              <button
                key={entry.outcome.outcomeIndex}
                type="button"
                className="button secondary small"
                onClick={() => {
                  if (onOutcomeChange) {
                    onOutcomeChange(entry.outcome.outcomeIndex);
                  } else if (typeof window !== "undefined") {
                    const params = new URLSearchParams(window.location.search);
                    params.set("outcome", String(entry.outcome.outcomeIndex));
                    window.location.search = params.toString();
                  }
                }}
              >
                Switch to {entry.outcome.label}
              </button>
            ))}
            <button type="button" className="button ghost small" onClick={() => setMode("buy")}>
              Buy more instead
            </button>
          </div>
        </div>
      ) : null}

      <div className="trade-amount-field">
        <div className="trade-amount-row">
          <label htmlFor="trade-amount" className="trade-amount-label">{mode === "buy" ? "Amount" : "Shares"}</label>
          {mode === "buy" && wallet.connected ? (
            <span className="trade-amount-hint">Balance {formatUsdcFromRaw(usdcBalanceRaw)} USDC</span>
          ) : null}
          {mode === "sell" && sharesHeldRaw > 0n ? (
            <span className="trade-amount-hint">Holding {formatShares(sharesHeldRaw)}</span>
          ) : null}
        </div>
        <div className="trade-amount-shell">
          <input
            id="trade-amount"
            className="trade-amount-input"
            name="amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            autoComplete="off"
          />
          <span className="trade-amount-suffix">{mode === "buy" ? "USDC" : `${outcome?.label ?? ""} shares`.trim()}</span>
        </div>
        <div className="trade-presets" role="group" aria-label="Quick amounts">
          {(mode === "buy" ? BUY_PRESETS : ["25", "50", "75"]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="trade-preset"
              onClick={() => {
                if (mode === "sell") {
                  if (sharesHeldRaw === 0n) return;
                  const pct = Number(preset) / 100;
                  setAmount((Number(sharesHeldRaw) / 1_000_000 * pct).toFixed(2));
                } else {
                  setAmount(preset);
                }
              }}
            >
              {mode === "buy" ? `$${preset}` : `${preset}%`}
            </button>
          ))}
          <button type="button" className="trade-preset max" onClick={setMaxAmount}>Max</button>
        </div>
      </div>

      {validAmount && outcome ? (
        <dl className="trade-quote" aria-label={mode === "buy" ? "Buy quote" : "Sell quote"}>
          {mode === "buy" ? (
            <>
              <div className="trade-quote-row"><dt>Shares received</dt><dd>{parsedAmount.toFixed(2)}</dd></div>
              <div className="trade-quote-row"><dt>Avg price</dt><dd>${price.toFixed(2)} per share</dd></div>
              <div className="trade-quote-row primary"><dt>Max payout</dt><dd>${parsedAmount.toFixed(2)}</dd></div>
              <div className="trade-quote-row muted"><dt>Slippage</dt><dd>0% · 1:1 collateral</dd></div>
            </>
          ) : (
            <>
              <div className="trade-quote-row"><dt>Avg price</dt><dd>${price.toFixed(2)} per share</dd></div>
              <div className="trade-quote-row primary"><dt>USDC received</dt><dd>${(parsedAmount * price).toFixed(2)}</dd></div>
              <div className="trade-quote-row muted"><dt>Slippage</dt><dd>0% · 1:1 collateral</dd></div>
            </>
          )}
        </dl>
      ) : (
        <p className="trade-quote-empty">Enter an amount to see your quote.</p>
      )}

      {riskBlocked ? <p className="trade-alert warn" role="alert">⚠ {riskBlocked}</p> : null}
      {errorMessage ? <p className="trade-alert error" role="alert">{errorMessage}</p> : null}

      <button
        className={`trade-cta${mode === "buy" ? " buy" : " sell"}`}
        type="submit"
        disabled={ctaDisabled || isPending}
      >
        <span className="trade-cta-label">{isPending ? "Updating…" : ctaLabel}</span>
        {validAmount && outcome && tradingOpen && !riskBlocked && !insufficientShares ? (
          <span className="trade-cta-meta">
            {mode === "buy" ? `Win up to $${parsedAmount.toFixed(2)}` : `Receive $${(parsedAmount * price).toFixed(2)}`}
          </span>
        ) : null}
      </button>

      <TxStatusBadge status={txStatus} txHash={txHash} explorerUrl={APP_CHAIN.blockExplorerUrls[0]} />

      <footer className="trade-footnote">
        <span aria-hidden>🛡</span>
        1:1 USDC collateral · oracle-settled · {needsApproval && mode === "buy" ? "USDC approval required" : "Funds escrowed on-chain"}
      </footer>
    </form>
  );
}

function ctaLabelFor({ status, mode, outcomeLabel, tradingOpen, needsApproval, riskBlocked, insufficientShares, amount, sharesHeldRaw }: { status: ReturnType<typeof useWallet>["status"]; mode: Mode; outcomeLabel?: string; tradingOpen: boolean; needsApproval: boolean; riskBlocked?: string; insufficientShares: boolean; amount: string; sharesHeldRaw: bigint }) {
  if (!tradingOpen) return "Trading closed";
  if (status === "disconnected" || status === "no-provider" || status === "error") return "Connect wallet to trade";
  if (status === "wrong-network") return `Switch to ${APP_CHAIN.name}`;
  if (status === "connecting") return "Connecting…";
  if (riskBlocked) return "Adjust amount";
  const parsed = Number(amount || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return mode === "buy" ? "Enter amount" : "Enter shares";
  if (mode === "buy") {
    if (needsApproval) return `Approve USDC + Buy ${outcomeLabel ?? ""}`.trim();
    return `Buy ${outcomeLabel ?? ""}`.trim();
  }
  if (insufficientShares) return sharesHeldRaw === 0n ? `No ${outcomeLabel ?? ""} shares held`.trim() : "Not enough shares";
  return `Sell ${outcomeLabel ?? ""}`.trim();
}

function TradePhaseHint({ phase }: { phase: "pre_match" | "live" | "closing" | "closed" }) {
  if (phase === "pre_match") return <span className="trade-phase pre-match"><span className="trade-phase-dot" />Pre-match · closes at kickoff</span>;
  if (phase === "closing") return <span className="trade-phase closing"><span className="trade-phase-dot" />Closing soon</span>;
  if (phase === "live") return <span className="trade-phase live"><span className="trade-phase-dot live-dot" />Live · prices update</span>;
  return <span className="trade-phase closed"><span className="trade-phase-dot" />Trading closed</span>;
}

function formatShares(raw: bigint): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

function formatUsdcFromRaw(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const fraction = raw % 1_000_000n;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return fractionStr.length > 0 ? `${whole}.${fractionStr}` : whole.toString();
}

function humanizeTradeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Transaction failed");
  if (/user (rejected|denied|cancel(?:l)?ed)/i.test(message)) return "You rejected the transaction in your wallet.";
  if (/insufficient funds/i.test(message)) return "Your wallet does not have enough native token to pay gas.";
  if (/transferFrom|ERC20: transfer amount exceeds (balance|allowance)|insufficient allowance/i.test(message)) {
    return "USDC transfer failed. Check your balance and approval, then try again.";
  }
  if (/execution reverted/i.test(message)) {
    return "Trade reverted on chain. The market may be closed or the price moved past your limit.";
  }
  if (/network|chain/i.test(message)) return "Wallet network mismatch. Switch to the configured network and try again.";
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
