"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CommercialMarketDefinition, Fixture, Market, MarketOutcome, MatchEvent, ResolutionRule } from "@polygoal/shared";
import { Card } from "@heroui/react";
import { OutcomeCard } from "./OutcomeCard";
import { TradeTicket } from "./TradeTicket";
import { SettlementRules } from "./SettlementRules";
import { MatchEventsList } from "../matches/MatchEventsList";
import { EmptyState } from "../ui/EmptyState";
import { formatProbabilityBps } from "../../lib/market-copy";

export type MarketBundle = {
  market: Market;
  commercial?: CommercialMarketDefinition;
  rule?: ResolutionRule;
  settlementRule?: string;
};

type ProductKey = "match_winner" | "exact_score";

type Props = {
  fixture: Fixture;
  matchWinner: MarketBundle;
  exactScore?: MarketBundle;
  events: MatchEvent[];
  initialProduct?: ProductKey;
  initialOutcomeIndex?: number;
};

export function FixtureMarketView({ fixture, matchWinner, exactScore, events, initialProduct = "match_winner", initialOutcomeIndex = 0 }: Props) {
  const products = useMemo(() => {
    const list: Array<{ key: ProductKey; label: string; bundle: MarketBundle }> = [
      { key: "match_winner", label: "Match winner", bundle: matchWinner },
    ];
    if (exactScore) list.push({ key: "exact_score", label: "Exact score", bundle: exactScore });
    return list;
  }, [matchWinner, exactScore]);

  const [activeProduct, setActiveProduct] = useState<ProductKey>(initialProduct);
  const [selectedOutcomeIndex, setSelectedOutcomeIndex] = useState<Record<ProductKey, number>>({
    match_winner: initialProduct === "match_winner" ? initialOutcomeIndex : 0,
    exact_score: initialProduct === "exact_score" ? initialOutcomeIndex : 0,
  });

  const activeBundle = activeProduct === "exact_score" && exactScore ? exactScore : matchWinner;
  const activeOutcomeIndex = selectedOutcomeIndex[activeProduct] ?? 0;

  useEffect(() => {
    if (activeProduct === "exact_score" && !exactScore) setActiveProduct("match_winner");
  }, [activeProduct, exactScore]);

  function handleSelect(product: ProductKey, outcomeIndex: number) {
    setActiveProduct(product);
    setSelectedOutcomeIndex((prev) => ({ ...prev, [product]: outcomeIndex }));
  }

  const selectedOutcome = activeBundle.market.outcomes.find((o) => o.outcomeIndex === activeOutcomeIndex) ?? activeBundle.market.outcomes[0];

  return (
    <div className="fixture-market-view">
      <div className="fixture-market-view-main">
        {products.length > 1 ? (
          <nav className="market-product-tabs" role="tablist" aria-label="Markets for this fixture">
            {products.map((product) => (
              <button
                key={product.key}
                type="button"
                role="tab"
                aria-selected={activeProduct === product.key}
                className={`market-product-tab${activeProduct === product.key ? " active" : ""}`}
                onClick={() => setActiveProduct(product.key)}
              >
                <span className="market-product-tab-label">{product.label}</span>
                <span className="market-product-tab-meta">{product.bundle.market.outcomes.length} outcomes</span>
              </button>
            ))}
          </nav>
        ) : null}

        {activeProduct === "match_winner" ? (
          <Card variant="default" className="stack market-product-panel" aria-labelledby="match-winner-heading">
            <header>
              <h2 id="match-winner-heading">Pick the winner</h2>
              <p className="kpi">90 minutes plus stoppage. Extra time and penalties don't count.</p>
            </header>
            <div className="market-detail-outcomes">
              {matchWinner.market.outcomes.map((outcome) => (
                <OutcomeCard
                  key={outcome.outcomeIndex}
                  outcome={outcome}
                  selected={activeProduct === "match_winner" && outcome.outcomeIndex === activeOutcomeIndex}
                  onSelect={(idx) => handleSelect("match_winner", idx)}
                />
              ))}
            </div>
          </Card>
        ) : null}

        {activeProduct === "exact_score" && exactScore ? (
          <Card variant="default" className="stack market-product-panel" aria-labelledby="exact-score-heading">
            <header>
              <h2 id="exact-score-heading">Pick the final score</h2>
              <p className="kpi">Predict the final regulation-time score. <strong>Other score</strong> covers anything not listed.</p>
            </header>
            {!exactScore.market.marketAddress ? (
              <p className="kpi market-preview-banner" role="status">
                Preview only · exact-score pools aren't on chain yet. Browse outcomes and provider odds; trading opens when the pool is deployed.
              </p>
            ) : null}
            <ExactScoreCells
              outcomes={exactScore.market.outcomes}
              selectedOutcomeIndex={activeProduct === "exact_score" ? activeOutcomeIndex : undefined}
              onSelect={(idx) => handleSelect("exact_score", idx)}
            />
          </Card>
        ) : null}

        <Card variant="default" className="stack fixture-live-feed-card">
          <header className="fixture-live-feed-header">
            <h3>Live feed</h3>
            <span className="kpi">{events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "Awaiting kickoff"}</span>
          </header>
          <MatchEventsList events={events} />
        </Card>

        <SettlementRules rule={activeBundle.rule} settlementRule={activeBundle.settlementRule} />

      </div>

      <aside className="fixture-market-view-side">
        <TradeTicketCard
          fixture={fixture}
          activeProduct={activeProduct}
          activeBundle={activeBundle}
          selectedOutcome={selectedOutcome}
          selectedOutcomeIndex={activeOutcomeIndex}
          onOutcomeChange={(idx) => handleSelect(activeProduct, idx)}
        />
      </aside>
    </div>
  );
}

function TradeTicketCard({ fixture, activeProduct, activeBundle, selectedOutcome, selectedOutcomeIndex, onOutcomeChange }: { fixture: Fixture; activeProduct: ProductKey; activeBundle: MarketBundle; selectedOutcome?: MarketOutcome; selectedOutcomeIndex: number; onOutcomeChange?: (idx: number) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const desired = activeProduct === "match_winner" ? "match_winner" : "exact_score";
    if ((params.get("market") ?? "match_winner") !== desired || Number(params.get("outcome") ?? 0) !== selectedOutcomeIndex) {
      params.set("market", desired);
      params.set("outcome", String(selectedOutcomeIndex));
      const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState(null, "", url);
    }
  }, [activeProduct, selectedOutcomeIndex]);

  return (
    <div ref={wrapperRef} className="fixture-trade-card">
      <div className="fixture-trade-card-header">
        <span className="kpi fixture-trade-card-eyebrow">{activeProduct === "match_winner" ? "Trade match winner" : "Trade exact score"}</span>
        <h3 className="fixture-trade-card-title">{fixture.homeTeam} vs {fixture.awayTeam}</h3>
      </div>
      {selectedOutcome ? (
        <TradeTicket market={activeBundle.market} selectedOutcomeIndex={selectedOutcomeIndex} onOutcomeChange={onOutcomeChange} />
      ) : (
        <EmptyState compact icon="·" title="Choose an outcome" description="Pick a winner or a final score on the left to start trading." />
      )}
    </div>
  );
}

function ExactScoreCells({ outcomes, selectedOutcomeIndex, onSelect }: { outcomes: MarketOutcome[]; selectedOutcomeIndex?: number; onSelect: (outcomeIndex: number) => void }) {
  const matrixOutcomes: Array<MarketOutcome | null> = [null, null, null, null, null, null, null, null, null];
  let otherOutcome: MarketOutcome | undefined;
  for (const outcome of outcomes) {
    const match = /^(\d)-(\d)$/.exec(outcome.label);
    if (match && match[1] !== undefined && match[2] !== undefined) {
      const home = Number(match[1]);
      const away = Number(match[2]);
      if (home >= 0 && home <= 2 && away >= 0 && away <= 2) {
        matrixOutcomes[home * 3 + away] = outcome;
        continue;
      }
    }
    if (!otherOutcome) otherOutcome = outcome;
  }

  const maxProb = Math.max(1, ...matrixOutcomes.filter((o): o is MarketOutcome => Boolean(o)).map((o) => o.probabilityBps));

  return (
    <div className="exact-score-matrix-wrap" role="radiogroup" aria-label="Exact score outcomes">
      <div className="exact-score-matrix">
        {matrixOutcomes.map((outcome, idx) => {
          if (!outcome) {
            return <span key={`empty-${idx}`} className="exact-score-cell exact-score-cell-empty" aria-hidden />;
          }
          const isSelected = selectedOutcomeIndex === outcome.outcomeIndex;
          const heat = Math.min(1, outcome.probabilityBps / maxProb);
          return (
            <button
              key={outcome.outcomeIndex}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`exact-score-cell${isSelected ? " selected" : ""}`}
              style={{ "--heat": heat } as React.CSSProperties}
              onClick={() => onSelect(outcome.outcomeIndex)}
              aria-label={`Score ${outcome.label}, ${formatProbabilityBps(outcome.probabilityBps)} probability`}
            >
              <span className="exact-score-cell-score">{outcome.label}</span>
              <span className="exact-score-cell-pct">{formatProbabilityBps(outcome.probabilityBps)}</span>
            </button>
          );
        })}
      </div>
      {otherOutcome ? (() => {
        const isSelected = selectedOutcomeIndex === otherOutcome.outcomeIndex;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`exact-score-other${isSelected ? " selected" : ""}`}
            onClick={() => onSelect(otherOutcome.outcomeIndex)}
            aria-label={`${otherOutcome.label}, ${formatProbabilityBps(otherOutcome.probabilityBps)} probability`}
          >
            <span className="exact-score-other-label">
              <strong>{otherOutcome.label}</strong>
              <small>Any score 3-x, x-3, or higher</small>
            </span>
            <span className="exact-score-other-pct">{formatProbabilityBps(otherOutcome.probabilityBps)}</span>
          </button>
        );
      })() : null}
    </div>
  );
}
