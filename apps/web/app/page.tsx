import Link from "next/link";
import type { Fixture } from "@polygoal/shared";
import { FixtureRow } from "../components/matches/FixtureRow";
import { PageHero } from "../components/ui/PageHero";
import { EmptyState } from "../components/ui/EmptyState";
import { DayJumper, type DayJumperItem } from "../components/ui/DayJumper";
import { FeaturedMarket } from "../components/ui/FeaturedMarket";
import { InsightRail } from "../components/ui/InsightRail";
import { consumerApi } from "../lib/api-client";

export const dynamic = "force-dynamic";

type FixtureWithMarkets = Fixture & { hasMatchWinner: boolean; hasExactScore: boolean };

type DateGroup = { dateKey: string; label: string; sublabel: string; items: FixtureWithMarkets[] };

function isoDate(input: string): string {
  return new Date(input).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function relativeDayLabel(dateKey: string): { label: string; sublabel: string } {
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const target = new Date(`${dateKey}T00:00:00Z`);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const sublabel = target.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (diff === 0) return { label: "Today", sublabel };
  if (diff === 1) return { label: "Tomorrow", sublabel };
  if (diff === -1) return { label: "Yesterday", sublabel };
  return {
    label: target.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    sublabel,
  };
}

async function loadData(): Promise<{
  liveFixtures: FixtureWithMarkets[];
  groups: DateGroup[];
  totalCount: number;
  loadError: boolean;
}> {
  try {
    const [fixtures, markets] = await Promise.all([
      consumerApi.listSchedule(),
      consumerApi.listCommercialMarkets(),
    ]);
    const flagsByFixtureId = new Map<string, { matchWinner: boolean; exactScore: boolean }>();
    for (const market of markets) {
      const entry = flagsByFixtureId.get(market.fixtureId) ?? { matchWinner: false, exactScore: false };
      if (market.marketType === "match_winner") entry.matchWinner = true;
      if (market.marketType === "exact_score") entry.exactScore = true;
      flagsByFixtureId.set(market.fixtureId, entry);
    }

    const augmented: FixtureWithMarkets[] = fixtures.map((fixture) => {
      const flags = flagsByFixtureId.get(fixture.id) ?? flagsByFixtureId.get(fixture.fifaMatchId) ?? { matchWinner: false, exactScore: false };
      return { ...fixture, hasMatchWinner: flags.matchWinner, hasExactScore: flags.exactScore };
    });

    const liveFixtures = augmented.filter((f) => f.status === "live");

    const groupMap = new Map<string, FixtureWithMarkets[]>();
    for (const fixture of augmented) {
      if (fixture.status === "live") continue;
      const key = isoDate(fixture.kickoffAtUtc);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(fixture);
    }

    const groups: DateGroup[] = [...groupMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, items]) => {
        const { label, sublabel } = relativeDayLabel(dateKey);
        items.sort((a, b) => a.kickoffAtUtc.localeCompare(b.kickoffAtUtc));
        return { dateKey, label, sublabel, items };
      });

    return { liveFixtures, groups, totalCount: augmented.length, loadError: false };
  } catch {
    return { liveFixtures: [], groups: [], totalCount: 0, loadError: true };
  }
}

const FALLBACK_API =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8787";

export default async function HomePage() {
  const { liveFixtures, groups, totalCount, loadError } = await loadData();
  const liveCount = liveFixtures.length;
  const todayKey = todayIso();
  const todayCount = groups.find((g) => g.dateKey === todayKey)?.items.length ?? 0;

  const jumpItems: DayJumperItem[] = [];
  if (liveCount > 0) jumpItems.push({ id: "live", label: "Live", sublabel: `${liveCount} on now`, count: liveCount, tone: "live" });
  for (const group of groups) {
    jumpItems.push({
      id: `day-${group.dateKey}`,
      label: group.label,
      sublabel: group.sublabel,
      count: group.items.length,
      isToday: group.dateKey === todayKey,
    });
  }

  const featuredFixture = liveFixtures[0] ?? groups[0]?.items[0];
  const allFixtures = [...liveFixtures, ...groups.flatMap(g => g.items)];
  const trendingItems = allFixtures.slice(0, 4).map(f => ({
    label: `${f.homeTeam} vs ${f.awayTeam}`,
    value: "$0",
  }));

  return (
    <main className="section-stack">
      <PageHero
        eyebrow="World Cup 2026 markets"
        title="Trade the match before odds move."
        aside={featuredFixture ? <FeaturedMarket fixture={featuredFixture} homeOdds={54} drawOdds={25} awayOdds={21} liquidity="$2.1M" /> : undefined}
      >
        <p>
          Live winner, draw, and exact-score markets for every fixture. Prices update
          with the game clock, liquidity, and crowd conviction.
        </p>
        <div className="hero-stats" aria-label="Market statistics">
          <span><strong>$8.4M</strong> 24h volume</span>
          <span><strong>{totalCount}</strong> fixtures</span>
          <span><strong>{liveCount}</strong> live now</span>
        </div>
      </PageHero>

      {loadError ? (
        <EmptyState
          tone="error"
          icon="⚠"
          title="Could not load fixtures"
          description={<>The backend at <code>{process.env.NEXT_PUBLIC_API_URL ?? FALLBACK_API}</code> returned an error. Make sure the API is running and schedules are bootstrapped.</>}
          action={<Link className="button secondary" href="/">Retry</Link>}
        />
      ) : null}

      {jumpItems.length > 0 ? <DayJumper items={jumpItems} /> : null}

      <section className="market-layout" aria-label="Prediction market overview">
        <div className="market-main">
          {liveCount > 0 ? (
            <section className="schedule-date-group" id="live">
              <header className="schedule-date-header is-live">
                <h2>
                  <span className="schedule-date-live-dot" aria-hidden />
                  Live now
                </h2>
                <span className="kpi">{liveCount} match{liveCount === 1 ? "" : "es"} trading right now</span>
              </header>
              <div className="fixture-grid">
                {liveFixtures.map((fixture) => (
                  <FixtureRow key={fixture.id} fixture={fixture} hasMatchWinner={fixture.hasMatchWinner} hasExactScore={fixture.hasExactScore} />
                ))}
              </div>
            </section>
          ) : null}

          {groups.map((group) => (
            <section className="schedule-date-group" key={group.dateKey} id={`day-${group.dateKey}`}>
              <header className="schedule-date-header">
                <h2>
                  {group.label}
                  <small>{group.sublabel}</small>
                </h2>
                <span className="kpi">{group.items.length} match{group.items.length === 1 ? "" : "es"}</span>
              </header>
              <div className="fixture-grid">
                {group.items.map((fixture) => (
                  <FixtureRow key={fixture.id} fixture={fixture} hasMatchWinner={fixture.hasMatchWinner} hasExactScore={fixture.hasExactScore} />
                ))}
              </div>
            </section>
          ))}

          {!loadError && totalCount === 0 ? (
            <EmptyState
              icon="🗓"
              title="Schedule not bootstrapped yet"
              description="Once the operator seeds the World Cup 2026 fixtures you'll see them here grouped by day."
            />
          ) : null}
        </div>

        <InsightRail 
          balance="$12,480.50"
          trending={trendingItems}
          momentum={liveCount > 0 ? {
            label: `${liveFixtures[0]?.homeTeam} yes`,
            change: "+8%",
            positive: true,
            bars: [28, 45, 38, 72, 64, 84],
          } : undefined}
          showWallet={true}
        />
      </section>
    </main>
  );
}
