"use client";

import { Card } from "@heroui/react";
import Link from "next/link";

interface TrendingItem {
  label: string;
  value: string;
  href?: string;
}

interface MomentumData {
  label: string;
  change: string;
  positive: boolean;
  bars: number[];
}

interface InsightRailProps {
  balance?: string;
  trending?: TrendingItem[];
  momentum?: MomentumData;
  showWallet?: boolean;
}

export function InsightRail({ 
  balance = "$0.00", 
  trending = [],
  momentum,
  showWallet = true 
}: InsightRailProps) {
  return (
    <aside className="insight-rail">
      {showWallet && (
        <Card className="rail-card wallet-card">
          <div className="rail-card-heading">
            <span>Account</span>
            <strong>X Layer</strong>
          </div>
          <div className="balance-line">
            <small>Available balance</small>
            <strong>{balance}</strong>
          </div>
          <Link href="/portfolio" className="full-button">
            View Portfolio
          </Link>
        </Card>
      )}

      {trending.length > 0 && (
        <Card className="rail-card">
          <div className="rail-card-heading">
            <span>Trending</span>
            <strong>24h</strong>
          </div>
          <ol className="trend-list">
            {trending.map((item, i) => (
              <li key={i}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {momentum && (
        <Card className="rail-card">
          <div className="rail-card-heading">
            <span>Momentum</span>
            <strong>Live</strong>
          </div>
          <div className="momentum-row">
            <span>{momentum.label}</span>
            <div className="mini-chart" aria-hidden="true">
              {momentum.bars.map((height, i) => (
                <i key={i} style={{ height: `${height}%` }} />
              ))}
            </div>
            <strong className={momentum.positive ? "positive" : "negative"}>
              {momentum.change}
            </strong>
          </div>
          <div className="settlement-note">
            Oracle window opens after final whistle.
          </div>
        </Card>
      )}
    </aside>
  );
}
