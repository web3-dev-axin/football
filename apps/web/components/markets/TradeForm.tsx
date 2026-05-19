import type { Market, OutcomeIndex } from "@worldcup/shared";
import { quoteBuy } from "@worldcup/sdk";
import { canTrade, type WalletView } from "../../lib/wallet";

export function TradeForm({ market, wallet, selectedOutcome = 0 }: { market: Market; wallet: WalletView; selectedOutcome?: OutcomeIndex }) {
  const tradeEnabled = canTrade(wallet, market.status);
  const outcome = market.outcomes.find((item) => item.outcomeIndex === selectedOutcome) ?? market.outcomes[0];
  const quote = quoteBuy(market, selectedOutcome, "100000000");
  return (
    <form className="card stack">
      <h3>Buy {outcome?.label ?? "Yes"}</h3>
      <label>
        Amount Mock USDC
        <input className="input" name="amount" defaultValue="100" inputMode="decimal" min="0" step="0.01" />
      </label>
      <dl className="metric-list" aria-label="Buy quote">
        <div className="metric-row">
          <dt>Expected shares</dt>
          <dd>{Number(quote.sharesOutRaw) / 1_000_000}</dd>
        </div>
        <div className="metric-row">
          <dt>Average price</dt>
          <dd>{(quote.averagePriceBps / 10_000).toFixed(2)}</dd>
        </div>
        <div className="metric-row" aria-label={`Potential payout: ${Number(quote.potentialPayoutRaw) / 1_000_000} Mock USDC`}>
          <dt>Potential payout</dt>
          <dd>{Number(quote.potentialPayoutRaw) / 1_000_000} Mock USDC</dd>
        </div>
        <div className="metric-row">
          <dt>Max slippage</dt>
          <dd>0.5%</dd>
        </div>
      </dl>
      <button className="button" disabled={!tradeEnabled} type="button">{tradeEnabled ? `Buy ${outcome?.label}` : wallet.connected ? "Trading unavailable" : "Connect wallet"}</button>
    </form>
  );
}
