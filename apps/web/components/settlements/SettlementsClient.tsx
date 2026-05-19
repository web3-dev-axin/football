"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CommercialFeatureFlags, Market, ResultProposal } from "@polygoal/shared";
import { Card } from "@heroui/react";
import { SettlementGroup } from "./SettlementGroup";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { consumerApi } from "../../lib/api-client";

export function SettlementsClient() {
  const [proposals, setProposals] = useState<ResultProposal[] | undefined>(undefined);
  const [marketsById, setMarketsById] = useState<Record<string, Market | undefined>>({});
  const [flags, setFlags] = useState<CommercialFeatureFlags | undefined>(undefined);
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, featureFlags] = await Promise.all([
          consumerApi.listSettlements(),
          consumerApi.getFeatureFlags().catch(() => undefined),
        ]);
        if (cancelled) return;
        setProposals(list);
        setFlags(featureFlags);
        const marketIds = [...new Set(list.map((p) => p.marketId))];
        const markets = await Promise.all(marketIds.map(async (id) => {
          try { return await consumerApi.getMarket(id); } catch { return undefined; }
        }));
        if (cancelled) return;
        const map: Record<string, Market | undefined> = {};
        for (const market of markets) if (market) map[market.id] = market;
        setMarketsById(map);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load settlements");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => groupProposals(proposals ?? []), [proposals]);
  const challengeEnabled = Boolean(flags?.enablePublicChallenge);

  if (error) {
    return (
      <EmptyState
        tone="error"
        icon="⚠"
        title="Could not load settlements"
        description={error}
        action={<Link className="button secondary" href="/settlements">Retry</Link>}
      />
    );
  }
  if (isLoading) {
    return (
      <Card variant="default" className="stack" aria-busy="true" aria-label="Loading settlements">
        <Skeleton height={20} width={220} />
        <Skeleton height={12} width="70%" />
        <Skeleton height={96} radius={12} />
        <Skeleton height={96} radius={12} />
        <Skeleton height={96} radius={12} />
      </Card>
    );
  }
  if (!proposals || proposals.length === 0) {
    return (
      <EmptyState
        icon="⚖"
        title="No settlements yet"
        description="When markets close, proposed and finalized results show up here. The oracle proposes a winning outcome, anyone can challenge during the dispute window, and finalized markets become redeemable in the portfolio."
        action={<Link className="button secondary" href="/">View markets</Link>}
      />
    );
  }

  return (
    <>
      <SettlementGroup
        title="Proposed"
        description="Open challenge window — operators can challenge with evidence"
        proposals={grouped.proposed}
        marketsById={marketsById}
        challengeEnabled={challengeEnabled}
        onChallenge={onChallengeStub}
        emptyIcon="📥"
        emptyTitle="No proposals waiting on challenges"
        emptyDescription="When the oracle proposes a result, it appears here for the challenge window."
      />
      <SettlementGroup
        title="Disputed"
        description="Under review"
        proposals={grouped.challenged}
        marketsById={marketsById}
        challengeEnabled={false}
        emptyIcon="🛡"
        emptyTitle="No active disputes"
        emptyDescription="Challenged proposals will be listed here until operators resolve them."
      />
      <SettlementGroup
        title="Finalized"
        description="Ready to redeem from your portfolio"
        proposals={grouped.finalized}
        marketsById={marketsById}
        challengeEnabled={false}
        emptyIcon="✔"
        emptyTitle="Nothing finalized yet"
        emptyDescription="Settled markets appear here once their challenge window closes without dispute."
      />
      <SettlementGroup
        title="Voided"
        description="Markets voided — refunds available in portfolio"
        proposals={grouped.voided}
        marketsById={marketsById}
        challengeEnabled={false}
        emptyIcon="↩"
        emptyTitle="No voided markets"
        emptyDescription="If a fixture is cancelled or abandoned, voided markets are listed here."
      />
    </>
  );
}

function groupProposals(proposals: ResultProposal[]) {
  return {
    proposed: proposals.filter((p) => p.status === "proposed"),
    challenged: proposals.filter((p) => p.status === "challenged"),
    finalized: proposals.filter((p) => p.status === "finalized"),
    voided: proposals.filter((p) => p.status === "voided"),
  };
}

function onChallengeStub(_proposal: ResultProposal) {
  alert("Public challenges require an operator key in the current release. Contact support with evidence.");
}
