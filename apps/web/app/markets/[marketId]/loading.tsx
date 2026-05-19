import { FixtureHeroSkeleton, MarketDetailSkeleton } from "../../../components/ui/Skeleton";

export default function MarketLoading() {
  return (
    <main className="section-stack" aria-busy="true">
      <FixtureHeroSkeleton />
      <MarketDetailSkeleton />
    </main>
  );
}
