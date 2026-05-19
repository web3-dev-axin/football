import { PageHero } from "../../components/ui/PageHero";
import { PortfolioPageClient } from "../../components/portfolio/PortfolioPageClient";
import { BalanceFaucet } from "../../components/portfolio/BalanceFaucet";

export default function PortfolioPage() {
  return (
    <main className="section-stack">
      <PageHero
        eyebrow="Portfolio"
        title="Your positions"
        showMedia={false}
        aside={<BalanceFaucet />}
      >
        Track open positions, redeemable winnings, and refunds in one place.
      </PageHero>
      <PortfolioPageClient />
    </main>
  );
}
