import { notFound } from "next/navigation";
import { OperatorConsole } from "../../components/operator/OperatorConsole";
import { createDemoDbWithCommercialMarkets } from "../../lib/demo-data";

export default function OperatorPage() {
  const operatorKey = process.env.NEXT_PUBLIC_OPERATOR_CONSOLE_ENABLED;
  if (operatorKey !== "true") {
    notFound();
  }
  const { db } = createDemoDbWithCommercialMarkets();
  db.pauseMarket("market-demo-63-73", "operator-desk", "provider delay");
  return <OperatorConsole db={db} />;
}
