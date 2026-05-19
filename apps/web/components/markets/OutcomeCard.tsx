"use client";

import type { MarketOutcome } from "@polygoal/shared";
import { formatProbabilityBps } from "../../lib/market-copy";

export function OutcomeCard({ outcome, selected, onSelect, disabled }: { outcome: MarketOutcome; selected: boolean; onSelect: (outcomeIndex: number) => void; disabled?: boolean }) {
  const price = `$${(outcome.probabilityBps / 10_000).toFixed(2)}`;
  return (
    <button
      type="button"
      className={selected ? "outcome-card outcome-card--selected" : "outcome-card"}
      onClick={() => onSelect(outcome.outcomeIndex)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${outcome.label} ${formatProbabilityBps(outcome.probabilityBps)} probability, ${price} per share`}
    >
      <span className="outcome-card-label">{outcome.label}</span>
      <strong>{formatProbabilityBps(outcome.probabilityBps)}</strong>
      <span className="outcome-card-price">{price} / share · pays $1.00 if {outcome.label} wins</span>
      <div className="probability-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, outcome.probabilityBps / 100)}%` }} />
      </div>
    </button>
  );
}
