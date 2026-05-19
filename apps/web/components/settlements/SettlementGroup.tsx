import type { ReactNode } from "react";
import type { Market, ResultProposal } from "@polygoal/shared";
import { Card, Chip } from "@heroui/react";
import { EmptyState } from "../ui/EmptyState";
import { SettlementRow } from "./SettlementRow";

export function SettlementGroup({ title, description, proposals, marketsById, challengeEnabled, emptyAction, emptyIcon, emptyTitle, emptyDescription, onChallenge }: { title: string; description?: string; proposals: ResultProposal[]; marketsById: Record<string, Market | undefined>; challengeEnabled: boolean; emptyAction?: ReactNode; emptyIcon?: ReactNode; emptyTitle?: string; emptyDescription?: ReactNode; onChallenge?: (proposal: ResultProposal) => void }) {
  return (
    <Card variant="default" className="stack settlement-group" role="region">
      <header className="group-header">
        <div className="group-header-text">
          <h3>{title}</h3>
          {description ? <p className="kpi">{description}</p> : null}
        </div>
        <Chip size="sm" variant="soft" color="success" className="count-chip" aria-label={`${proposals.length} ${title}`}>
          {proposals.length}
        </Chip>
      </header>
      {proposals.length === 0 ? (
        <EmptyState
          compact
          icon={emptyIcon ?? "🧾"}
          title={emptyTitle ?? `No ${title.toLowerCase()} settlements`}
          description={emptyDescription ?? description}
          action={emptyAction}
        />
      ) : (
        <ul className="settlement-list">
          {proposals.map((proposal) => {
            const market = marketsById[proposal.marketId];
            const outcome = market?.outcomes.find((o) => o.outcomeIndex === proposal.winningOutcome);
            return (
              <SettlementRow
                key={proposal.id}
                proposal={proposal}
                market={market}
                marketTitle={market?.title}
                outcomeLabel={outcome?.label}
                challengeEnabled={challengeEnabled}
                onChallenge={onChallenge ? () => onChallenge(proposal) : undefined}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );
}
