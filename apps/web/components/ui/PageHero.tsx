import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  children,
  actions,
  aside,
  showMedia = true,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  showMedia?: boolean;
}) {
  const classes = ["page-hero"];
  if (!showMedia) classes.push("page-hero--compact");
  if (aside) classes.push("page-hero--with-aside");
  return (
    <section className={classes.join(" ")}>
      <div className="hero-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {children ? <div className="kpi">{children}</div> : null}
        {actions ? <div className="hero-actions">{actions}</div> : null}
      </div>
      {aside ? <aside className="hero-aside">{aside}</aside> : null}
      {showMedia && !aside ? <div className="hero-media stadium-net" aria-hidden="true" /> : null}
    </section>
  );
}
