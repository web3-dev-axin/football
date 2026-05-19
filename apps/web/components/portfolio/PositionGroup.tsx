import type { ReactNode } from "react";
import Link from "next/link";
import { Card, Chip } from "@heroui/react";
import { EmptyState } from "../ui/EmptyState";
import { PositionRow, type AggregatedPosition } from "./PositionRow";

type PositionAction = "redeem" | "refund" | "none";

type Props = {
  title: string;
  description?: string;
  positions: AggregatedPosition[];
  action: PositionAction;
  emptyAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyIcon?: ReactNode;
};

const DEFAULTS: Record<PositionAction, { icon: string; title: string; description: string; cta?: { label: string; href: string } }> = {
  redeem: { icon: "💰", title: "Nothing to redeem yet", description: "Winning shares move here as soon as a market settles. Buy outcome shares to start.", cta: { label: "Browse markets", href: "/" } },
  refund: { icon: "↩", title: "No refunds available", description: "If a fixture is voided you'll be able to reclaim the collateral here." },
  none: { icon: "📭", title: "No positions in this bucket", description: "Positions land here once a market enters this state." },
};

export function PositionGroup({ title, description, positions, action, emptyAction, emptyTitle, emptyDescription, emptyIcon }: Props) {
  const fallback = DEFAULTS[action];
  const resolvedAction = emptyAction ?? (fallback.cta ? <Link className="button secondary" href={fallback.cta.href}>{fallback.cta.label}</Link> : undefined);
  return (
    <Card variant="default" className="position-group stack" role="region">
      <header className="group-header">
        <div className="group-header-text">
          <h3>{title}</h3>
          {description ? <p className="kpi">{description}</p> : null}
        </div>
        <Chip size="sm" variant="soft" color="success" className="count-chip" aria-label={`${positions.length} ${title}`}>
          {positions.length}
        </Chip>
      </header>
      {positions.length === 0 ? (
        <EmptyState
          compact
          icon={emptyIcon ?? fallback.icon}
          title={emptyTitle ?? fallback.title}
          description={emptyDescription ?? fallback.description}
          action={resolvedAction}
        />
      ) : (
        <ul className="position-list">
          {positions.map((position) => (
            <PositionRow key={`${position.marketId}-${position.outcomeIndex}`} position={position} action={action} />
          ))}
        </ul>
      )}
    </Card>
  );
}
