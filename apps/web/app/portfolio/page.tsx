import { createDemoDbWithMarket } from "../../lib/demo-data";

export default function PortfolioPage() {
  const { market } = createDemoDbWithMarket();
  return (
    <main className="stack">
      <h1>Portfolio</h1>
      <section className="card">
        <h2>{market.title}</h2>
        <p>Demo position: 100 Yes shares · potential payout 100 Mock USDC.</p>
      </section>
    </main>
  );
}
