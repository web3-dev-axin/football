import { DayJumperSkeleton, FixtureGridSkeleton, PageHeroSkeleton, Skeleton } from "../components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <main className="section-stack" aria-busy="true">
      <PageHeroSkeleton />
      <DayJumperSkeleton />
      <section className="schedule-date-group">
        <header className="schedule-date-header">
          <Skeleton height={22} width={180} />
          <Skeleton height={12} width={80} />
        </header>
        <FixtureGridSkeleton count={6} />
      </section>
      <section className="schedule-date-group">
        <header className="schedule-date-header">
          <Skeleton height={22} width={160} />
          <Skeleton height={12} width={80} />
        </header>
        <FixtureGridSkeleton count={6} />
      </section>
    </main>
  );
}
