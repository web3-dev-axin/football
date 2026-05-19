import { PageHero } from "../../components/ui/PageHero";
import { SettlementsClient } from "../../components/settlements/SettlementsClient";

export const dynamic = "force-dynamic";

export default function SettlementsPage() {
  return (
    <main className="section-stack">
      <PageHero eyebrow="Settlements" title="Settlement timeline" showMedia={false}>
        Every closed market goes through a proposed result, a public challenge window, then a finalized payout. Everything happens on chain and is auditable.
      </PageHero>
      <SettlementsClient />
    </main>
  );
}
