import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_FIXTURE, RESOLUTION_RULES } from "@polygoal/shared";
import { SettlementRules } from "../components/markets/SettlementRules";
import { FixtureHero } from "../components/matches/FixtureHero";
import { FixtureRow } from "../components/matches/FixtureRow";
import { MatchEventsList } from "../components/matches/MatchEventsList";

describe("market components", () => {
  test("SettlementRules renders human-readable rules with bullets and challenge window", () => {
    const html = renderToStaticMarkup(<SettlementRules rule={RESOLUTION_RULES.full_time_match_winner_excluding_extra_time_and_penalties} />);
    expect(html).toContain("Settlement rules");
    expect(html).toContain("Resolves on the final score after 90 minutes");
    expect(html).toContain("Extra time and penalty shootouts are ignored");
    expect(html).toContain("Challenge window:");
    expect(html).toContain("10 minutes");
  });

  test("FixtureHero shows score, clock, venue and data badge", () => {
    const html = renderToStaticMarkup(<FixtureHero fixture={DEMO_FIXTURE} />);
    expect(html).toContain("Brazil");
    expect(html).toContain("Morocco");
    expect(html).toContain("New York New Jersey Stadium");
    expect(html).toContain("Data verified");
  });

  test("FixtureRow renders a vertical card with flags, codes, and unified-market action buttons", () => {
    const html = renderToStaticMarkup(<FixtureRow fixture={DEMO_FIXTURE} hasMatchWinner hasExactScore />);
    expect(html).toContain("fixture-card");
    expect(html).toContain("fixture-card-flag");
    expect(html).toContain("fixture-card-board");
    expect(html).toContain("Brazil");
    expect(html).toContain("Morocco");
    expect(html).toContain("BRA");
    expect(html).toContain("MAR");
    expect(html).toContain("Match winner");
    expect(html).toContain("Exact score");
    const unifiedHref = `/markets/${encodeURIComponent(`${DEMO_FIXTURE.id}:match_winner`)}`;
    expect(html).toContain(unifiedHref);
    expect(html).toContain(`${unifiedHref}?market=exact_score`);
    expect(html).not.toContain(`/markets/${encodeURIComponent(`${DEMO_FIXTURE.id}:exact_score`)}`);
  });

  test("FixtureRow shows pending markets state when none bootstrapped", () => {
    const html = renderToStaticMarkup(<FixtureRow fixture={DEMO_FIXTURE} />);
    expect(html).toContain("Markets open at kickoff");
    expect(html).toContain("fixture-card-pending");
  });

  test("MatchEventsList shows empty state when no events", () => {
    const html = renderToStaticMarkup(<MatchEventsList events={[]} />);
    expect(html).toContain("Waiting for the first whistle");
    expect(html).toContain("Goals, VAR reviews");
  });

  test("MatchEventsList renders a goal event", () => {
    const events = [
      { id: "e1", fixtureId: "f", providerEventId: "p", eventType: "goal" as const, team: "Brazil", matchMinute: 12, matchSecond: 720, isConfirmed: true, isCancelled: false, source: "sports_data_provider" as const },
    ];
    const html = renderToStaticMarkup(<MatchEventsList events={events} />);
    expect(html).toMatch(/12(&#x27;|')/);
    expect(html).toContain("Brazil goal");
    expect(html).toContain("match-events-list");
  });
});
