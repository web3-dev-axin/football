import type { ReactNode } from "react";
import { Card } from "@heroui/react";

export type EmptyStateTone = "info" | "warn" | "error" | "success";

type Props = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: EmptyStateTone;
  compact?: boolean;
};

export function EmptyState({ title, description, action, icon, tone = "info", compact = false }: Props) {
  const className = ["empty-state", `tone-${tone}`, compact ? "compact" : ""].filter(Boolean).join(" ");
  const ariaRole = tone === "error" ? "alert" : "status";
  return (
    <Card
      variant={compact ? "transparent" : "default"}
      className={className}
      role={ariaRole}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <div className="empty-state-icon" aria-hidden>{icon ?? defaultIconFor(tone)}</div>
      <div className="empty-state-text">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </Card>
  );
}

function defaultIconFor(tone: EmptyStateTone): string {
  switch (tone) {
    case "warn": return "⚠";
    case "error": return "✕";
    case "success": return "✓";
    default: return "·";
  }
}
