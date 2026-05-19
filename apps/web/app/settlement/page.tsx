import { SettlementPanel } from "../../components/settlement/SettlementPanel";
import { createDemoDbWithSettlement } from "../../lib/demo-data";

export default function SettlementPage() {
  const { market, proposal } = createDemoDbWithSettlement();
  return (
    <main className="stack">
      <h1>Settlement Center</h1>
      <SettlementPanel market={market} proposal={proposal} />
    </main>
  );
}
