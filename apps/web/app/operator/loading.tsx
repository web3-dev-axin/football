import { PageHeroSkeleton, Skeleton } from "../../components/ui/Skeleton";

export default function OperatorLoading() {
  return (
    <main className="section-stack" aria-busy="true">
      <PageHeroSkeleton />
      <section className="card stack" aria-hidden="true">
        <Skeleton height={20} width={180} />
        <Skeleton height={120} radius={12} />
        <Skeleton height={120} radius={12} />
      </section>
    </main>
  );
}
