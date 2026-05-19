import Link from "next/link";
import { redirect } from "next/navigation";
import type { CommercialMarketDefinition, Fixture, Market, MatchEvent, ResolutionRule, ResolutionRuleCode } from "@polygoal/shared";
import { RESOLUTION_RULES } from "@polygoal/shared";
import { FixtureHero } from "../../../components/matches/FixtureHero";
import { FixtureMarketView, type MarketBundle } from "../../../components/markets/FixtureMarketView";
import { EmptyState } from "../../../components/ui/EmptyState";
import { consumerApi } from "../../../lib/api-client";

export const dynamic = "force-dynamic";

type ProductKey = "match_winner" | "exact_score";

function parseMarketId(marketId: string): { fixtureId: string; product: ProductKey | "unknown" } {
  if (marketId.endsWith(":match_winner")) return { fixtureId: marketId.slice(0, -":match_winner".length), product: "match_winner" };
  if (marketId.endsWith(":exact_score")) return { fixtureId: marketId.slice(0, -":exact_score".length), product: "exact_score" };
  return { fixtureId: marketId, product: "unknown" };
}

function resolveRule(commercial?: CommercialMarketDefinition): ResolutionRule | undefined {
  if (commercial?.resolutionRule) return commercial.resolutionRule;
  const policy = commercial?.resolutionPolicy as ResolutionRuleCode | undefined;
  if (policy && policy in RESOLUTION_RULES) return RESOLUTION_RULES[policy];
  return undefined;
}

async function loadBundle(marketId: string, commercialMarkets: CommercialMarketDefinition[]): Promise<MarketBundle | undefined> {
  try {
    const market = await consumerApi.getMarket(marketId);
    const commercial = commercialMarkets.find((candidate) => candidate.id === marketId);
    const rule = resolveRule(commercial);
    return { market, commercial, rule, settlementRule: commercial?.settlementRule };
  } catch {
    return undefined;
  }
}

async function loadEvents(fifaMatchId: string): Promise<MatchEvent[]> {
  try {
    return await consumerApi.getFixtureEvents(fifaMatchId);
  } catch {
    return [];
  }
}

function buildRedirect(targetMarketId: string, search?: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  params.set("market", "exact_score");
  if (search) {
    const outcomeRaw = search.outcome;
    const outcome = Array.isArray(outcomeRaw) ? outcomeRaw[0] : outcomeRaw;
    if (outcome) params.set("outcome", String(outcome));
  }
  return `/markets/${encodeURIComponent(targetMarketId)}?${params.toString()}`;
}

export default async function MarketPage({ params, searchParams }: { params: Promise<{ marketId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ marketId: rawMarketId }, search] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const marketId = decodeURIComponent(rawMarketId);
  const parsed = parseMarketId(marketId);

  if (parsed.product === "exact_score") {
    redirect(buildRedirect(`${parsed.fixtureId}:match_winner`, search));
  }

  const matchWinnerId = parsed.product === "match_winner" ? marketId : `${parsed.fixtureId}:match_winner`;
  const exactScoreId = `${parsed.fixtureId}:exact_score`;

  let commercialMarkets: CommercialMarketDefinition[] = [];
  try {
    commercialMarkets = await consumerApi.listCommercialMarkets({ fixtureId: parsed.fixtureId });
  } catch {
    commercialMarkets = [];
  }

  const [matchWinnerBundle, exactScoreBundle] = await Promise.all([
    loadBundle(matchWinnerId, commercialMarkets),
    loadBundle(exactScoreId, commercialMarkets),
  ]);

  if (!matchWinnerBundle && !exactScoreBundle) {
    return (
      <main className="section-stack">
        <EmptyState
          tone="warn"
          icon="🔍"
          title="Market not found"
          description="This pool doesn't exist or the backend is unreachable. The market may have been voided or the link is out of date."
          action={<Link className="button secondary" href="/">Back to markets</Link>}
        />
      </main>
    );
  }

  const primary = matchWinnerBundle ?? exactScoreBundle!;
  const fixture: Fixture = primary.market.fixture;

  let events = await loadEvents(fixture.fifaMatchId);
  events = events.sort((a, b) => b.matchSecond - a.matchSecond);

  const desiredProductRaw = (search as Record<string, string | string[] | undefined> | undefined)?.market;
  const desiredProduct = Array.isArray(desiredProductRaw) ? desiredProductRaw[0] : desiredProductRaw;
  const initialProduct: ProductKey = desiredProduct === "exact_score" && exactScoreBundle ? "exact_score" : "match_winner";

  const outcomeRaw = (search as Record<string, string | string[] | undefined> | undefined)?.outcome;
  const outcomeValue = Array.isArray(outcomeRaw) ? outcomeRaw[0] : outcomeRaw;
  const initialOutcomeIndex = Math.max(0, Number.isFinite(Number(outcomeValue)) ? Number(outcomeValue) : 0);

  return (
    <main className="section-stack">
      <FixtureHero fixture={fixture} />
      <FixtureMarketView
        fixture={fixture}
        matchWinner={matchWinnerBundle ?? primary}
        exactScore={exactScoreBundle}
        events={events}
        initialProduct={initialProduct}
        initialOutcomeIndex={initialOutcomeIndex}
      />
    </main>
  );
}
