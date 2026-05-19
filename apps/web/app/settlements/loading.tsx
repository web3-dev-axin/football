import { PageHeroSkeleton, Skeleton } from "../../components/ui/Skeleton";

export default function SettlementsLoading() {
  return (
    <main className="section-stack" aria-busy="true">
      <PageHeroSkeleton />
      <section className="card stack" aria-hidden="true">
        <Skeleton height={20} width={220} />
        <Skeleton height={12} width="70%" />
        <Skeleton height={96} radius={12} />
        <Skeleton height={96} radius={12} />
        <Skeleton height={96} radius={12} />
      </section>
    </main>
  );
}
