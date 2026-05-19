import { OperatorConsole } from "../../components/operator/OperatorConsole";
import { createDemoDbWithCommercialMarkets } from "../../lib/demo-data";

export default function OperatorPage() {
  const { db } = createDemoDbWithCommercialMarkets();
  db.pauseMarket("market-demo-63-73", "operator-demo", "provider delay demo");
  return <OperatorConsole db={db} />;
}
