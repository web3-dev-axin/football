import type { CSSProperties } from "react";

type SkeletonProps = {
  height?: number | string;
  width?: number | string;
  radius?: number;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ height = 16, width = "100%", radius = 8, className, style }: SkeletonProps) {
  const composedStyle: CSSProperties = {
    height: typeof height === "number" ? `${height}px` : height,
    width: typeof width === "number" ? `${width}px` : width,
    borderRadius: `${radius}px`,
    ...style,
  };
  return <div className={`skeleton${className ? ` ${className}` : ""}`} style={composedStyle} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="card stack" aria-hidden="true">
      <Skeleton height={20} width="40%" />
      <Skeleton height={32} width="80%" />
      <Skeleton height={16} width="60%" />
      <Skeleton height={48} />
    </div>
  );
}

export function SkeletonText({ lines = 2, lastWidth = "55%" }: { lines?: number; lastWidth?: string | number }) {
  return (
    <div className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, idx) => (
        <Skeleton key={idx} height={12} width={idx === lines - 1 ? lastWidth : "100%"} />
      ))}
    </div>
  );
}

export function FixtureCardSkeleton() {
  return (
    <article className="fixture-card skeleton-fixture-card" aria-hidden="true">
      <header className="fixture-card-top">
        <Skeleton height={14} width={120} radius={6} />
        <Skeleton height={28} width={84} radius={10} />
      </header>
      <div className="fixture-card-board" style={{ pointerEvents: "none" }}>
        <div className="fixture-card-team">
          <Skeleton height={36} width={36} radius={18} />
          <Skeleton height={16} width="78%" />
          <Skeleton height={10} width="40%" />
        </div>
        <div className="fixture-card-center">
          <Skeleton height={24} width={48} radius={999} />
        </div>
        <div className="fixture-card-team away">
          <Skeleton height={36} width={36} radius={18} />
          <Skeleton height={16} width="78%" />
          <Skeleton height={10} width="40%" />
        </div>
      </div>
      <div className="fixture-card-meta"><Skeleton height={12} width="55%" /></div>
      <footer className="fixture-card-actions">
        <Skeleton height={48} radius={12} />
        <Skeleton height={48} radius={12} />
      </footer>
    </article>
  );
}

export function FixtureGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="fixture-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, idx) => (
        <FixtureCardSkeleton key={idx} />
      ))}
    </div>
  );
}

export function PageHeroSkeleton() {
  return (
    <section className="page-hero skeleton-page-hero" aria-hidden="true">
      <div className="page-hero-content">
        <Skeleton height={12} width={88} radius={6} />
        <Skeleton height={32} width="62%" radius={10} />
        <Skeleton height={14} width="92%" />
        <Skeleton height={14} width="74%" />
        <div className="hero-actions">
          <Skeleton height={44} width={180} radius={999} />
          <Skeleton height={44} width={140} radius={999} />
        </div>
      </div>
    </section>
  );
}

export function DayJumperSkeleton() {
  return (
    <div className="day-jumper" aria-hidden="true">
      {Array.from({ length: 6 }, (_, idx) => (
        <div key={idx} className="day-jumper-pill" style={{ pointerEvents: "none" }}>
          <Skeleton height={14} width={60} radius={6} />
          <Skeleton height={10} width={42} radius={6} />
        </div>
      ))}
    </div>
  );
}

export function FixtureHeroSkeleton() {
  return (
    <section className="fixture-hero skeleton-hero" aria-hidden="true">
      <Skeleton height={14} width={220} radius={6} style={{ background: "rgba(255,255,255,0.18)" }} />
      <div className="fixture-hero-board">
        <div className="fixture-hero-team">
          <Skeleton height={54} width={54} radius={28} style={{ background: "rgba(255,255,255,0.16)" }} />
          <div className="fixture-hero-team-text">
            <Skeleton height={12} width={50} radius={6} style={{ background: "rgba(255,255,255,0.18)" }} />
            <Skeleton height={28} width="80%" radius={8} style={{ background: "rgba(255,255,255,0.22)" }} />
            <Skeleton height={10} width={40} radius={6} style={{ background: "rgba(255,255,255,0.16)" }} />
          </div>
        </div>
        <div className="fixture-hero-center">
          <Skeleton height={18} width={70} radius={999} style={{ background: "rgba(255,255,255,0.18)" }} />
          <Skeleton height={36} width={110} radius={8} style={{ background: "rgba(255,255,255,0.22)" }} />
        </div>
        <div className="fixture-hero-team fixture-hero-team-away">
          <div className="fixture-hero-team-text" style={{ justifyItems: "flex-end" }}>
            <Skeleton height={12} width={50} radius={6} style={{ background: "rgba(255,255,255,0.18)" }} />
            <Skeleton height={28} width="80%" radius={8} style={{ background: "rgba(255,255,255,0.22)" }} />
            <Skeleton height={10} width={40} radius={6} style={{ background: "rgba(255,255,255,0.16)" }} />
          </div>
          <Skeleton height={54} width={54} radius={28} style={{ background: "rgba(255,255,255,0.16)" }} />
        </div>
      </div>
      <footer className="fixture-hero-footer">
        <Skeleton height={12} width={160} radius={6} style={{ background: "rgba(255,255,255,0.16)" }} />
        <Skeleton height={12} width={120} radius={6} style={{ background: "rgba(255,255,255,0.16)" }} />
        <Skeleton height={20} width={100} radius={999} style={{ background: "rgba(255,255,255,0.16)" }} />
      </footer>
    </section>
  );
}

export function TradeTicketSkeleton() {
  return (
    <div className="trade-ticket" aria-hidden="true">
      <div className="trade-segment">
        <Skeleton height={40} radius={10} />
        <Skeleton height={40} radius={10} />
      </div>
      <Skeleton height={64} radius={14} />
      <div className="trade-amount-field">
        <Skeleton height={12} width={80} radius={6} />
        <Skeleton height={62} radius={14} />
        <div className="trade-presets">
          <Skeleton height={28} width={48} radius={999} />
          <Skeleton height={28} width={48} radius={999} />
          <Skeleton height={28} width={48} radius={999} />
          <Skeleton height={28} width={48} radius={999} />
        </div>
      </div>
      <Skeleton height={120} radius={12} />
      <Skeleton height={54} radius={14} />
    </div>
  );
}

export function MarketDetailSkeleton() {
  return (
    <div className="fixture-market-view" aria-hidden="true">
      <div className="fixture-market-view-main">
        <div className="market-product-tabs">
          <Skeleton height={48} radius={10} />
          <Skeleton height={48} radius={10} />
        </div>
        <div className="card stack market-product-panel">
          <Skeleton height={22} width="40%" />
          <Skeleton height={12} width="78%" />
          <div className="market-detail-outcomes">
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
          </div>
        </div>
        <div className="card stack">
          <Skeleton height={16} width={120} />
          <Skeleton height={12} width="90%" />
          <Skeleton height={12} width="60%" />
        </div>
      </div>
      <aside className="fixture-market-view-side">
        <div className="fixture-trade-card">
          <Skeleton height={12} width={120} />
          <Skeleton height={20} width="80%" />
          <TradeTicketSkeleton />
        </div>
      </aside>
    </div>
  );
}
