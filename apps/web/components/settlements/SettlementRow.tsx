import type { Market, ResultProposal } from "@polygoal/shared";
import Link from "next/link";
import { Card } from "@heroui/react";
import { CountdownTimer } from "../ui/CountdownTimer";
import { colorForOutcome } from "../../lib/outcome-colors";
import { marketHref } from "../../lib/market-copy";

type Props = {
  proposal: ResultProposal;
  market?: Market;
  marketTitle?: string;
  outcomeLabel?: string;
  challengeEnabled: boolean;
  onChallenge?: () => void;
};

const STATUS_LABEL: Record<ResultProposal["status"], string> = {
  proposed: "Proposed",
  challenged: "Disputed",
  finalized: "Finalized",
  voided: "Voided",
};

export function SettlementRow({ proposal, market, marketTitle, outcomeLabel, onChallenge, challengeEnabled }: Props) {
  const isProposed = proposal.status === "proposed";
  const isFinalized = proposal.status === "finalized";
  const outcomeCount = market?.outcomes.length ?? 3;
  const commercialType = inferCommercialType(proposal.marketId);
  const outcomeColor = colorForOutcome(commercialType, proposal.winningOutcome, outcomeCount);
  const title = marketTitle ?? market?.title ?? `Market ${proposal.marketId}`;
  const winning = outcomeLabel ?? market?.outcomes.find((o) => o.outcomeIndex === proposal.winningOutcome)?.label ?? `Outcome ${proposal.winningOutcome}`;

  const evidenceUsable = isUsableEvidenceUri(proposal.evidenceUri);
  const evidencePending = !evidenceUsable && Boolean(proposal.evidenceUri);
  const hasChallenge = isProposed && Boolean(onChallenge);
  const hasFooter = evidenceUsable || evidencePending || hasChallenge;

  return (
    <li className="settlement-card-item" style={{ ["--outcome-color" as string]: outcomeColor }}>
      <Card variant="default" className={`settlement-card status-${proposal.status}`}>
        <span className="settlement-card-stripe" aria-hidden />

        <Card.Header className="settlement-card-header">
          <div className="settlement-card-header-top">
            <span className={`settlement-card-status state-${proposal.status}`}>{STATUS_LABEL[proposal.status]}</span>
            {isProposed ? (
              <div className="settlement-card-countdown">
                <CountdownTimer targetIsoUtc={proposal.challengeDeadline} label="Ends in" expiredLabel="Ready" />
              </div>
            ) : isFinalized ? (
              <span className="settlement-card-finalized">Settled</span>
            ) : null}
          </div>
          <Link className="settlement-card-fixture" href={marketHref(proposal.marketId)} prefetch={false}>
            {title}
          </Link>
        </Card.Header>

        <Card.Content className="settlement-card-content">
          <div className="settlement-card-outcome">
            <span className="outcome-dot" aria-hidden />
            <div className="settlement-card-outcome-text">
              <span className="kpi">Winning outcome</span>
              <strong>{winning}</strong>
            </div>
          </div>

          {proposal.goalCountInWindow > 0 ? (
            <div className="settlement-card-fact">
              <span className="kpi">Goals in window</span>
              <strong>{proposal.goalCountInWindow}</strong>
            </div>
          ) : null}
        </Card.Content>

        {hasFooter ? (
          <Card.Footer className="settlement-card-footer">
            {evidenceUsable ? (
              <a className="button ghost small" href={proposal.evidenceUri} target="_blank" rel="noopener">
                Evidence ↗
              </a>
            ) : evidencePending ? (
              <span className="button ghost small" aria-disabled title="Evidence URL not provided yet">
                Evidence pending
              </span>
            ) : null}
            {hasChallenge ? (
              <button
                type="button"
                className="button secondary small"
                onClick={onChallenge}
                disabled={!challengeEnabled}
                title={challengeEnabled ? undefined : "Public challenges are disabled. Contact support."}
              >
                Challenge
              </button>
            ) : null}
          </Card.Footer>
        ) : null}
      </Card>
    </li>
  );
}

function inferCommercialType(marketId: string): string | undefined {
  if (!marketId.startsWith("fixture:")) return undefined;
  const parts = marketId.split(":");
  return parts[parts.length - 1];
}

// Evidence URIs from demo / placeholder data point at non-routable hosts.
// Treat those as "no evidence" so users don't land on broken pages.
const PLACEHOLDER_EVIDENCE_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "127.0.0.1",
]);

function isUsableEvidenceUri(uri: string | undefined | null): uri is string {
  if (!uri) return false;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (PLACEHOLDER_EVIDENCE_HOSTS.has(parsed.hostname.toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}
