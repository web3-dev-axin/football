import type { Market, OutcomeIndex } from "@worldcup/shared";
import { canTrade, type WalletView } from "../../lib/wallet";

export function SellPanel({ market, wallet, selectedOutcome = 0 }: { market: Market; wallet: WalletView; selectedOutcome?: OutcomeIndex }) {
  const tradeEnabled = canTrade(wallet, market.status);
  const outcome = market.outcomes.find((item) => item.outcomeIndex === selectedOutcome) ?? market.outcomes[0];
  return (
    <form className="card stack">
      <h3>Sell {outcome?.label ?? "Yes"}</h3>
      <label>
        Shares to sell
        <input className="input" name="shares" defaultValue="50" inputMode="decimal" min="0" step="0.01" />
      </label>
      <dl className="metric-list" aria-label="Sell quote">
        <div className="metric-row">
          <dt>Estimated Mock USDC received</dt>
          <dd>50</dd>
        </div>
        <div className="metric-row">
          <dt>Price impact</dt>
          <dd>0.0%</dd>
        </div>
        <div className="metric-row">
          <dt>Fee</dt>
          <dd>0.00</dd>
        </div>
      </dl>
      <button className="button" disabled={!tradeEnabled} type="button">{tradeEnabled ? `Sell ${outcome?.label}` : wallet.connected ? "Selling unavailable" : "Connect wallet"}</button>
    </form>
  );
}
