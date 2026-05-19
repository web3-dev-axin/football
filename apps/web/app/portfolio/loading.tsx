import { PageHeroSkeleton, Skeleton } from "../../components/ui/Skeleton";

export default function PortfolioLoading() {
  return (
    <main className="section-stack" aria-busy="true">
      <PageHeroSkeleton />
      <section className="card stack" aria-hidden="true">
        <Skeleton height={20} width={160} />
        <Skeleton height={12} width="60%" />
        <Skeleton height={120} radius={12} />
      </section>
      <section className="card stack" aria-hidden="true">
        <Skeleton height={20} width={200} />
        <Skeleton height={56} radius={12} />
        <Skeleton height={56} radius={12} />
        <Skeleton height={56} radius={12} />
      </section>
    </main>
  );
}
