import { Card } from "@heroui/react";

export function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Card variant="default" className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </Card>
  );
}
