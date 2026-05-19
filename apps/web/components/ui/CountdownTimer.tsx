"use client";

import { useEffect, useState } from "react";

function formatRemaining(deltaMs: number): string {
  if (deltaMs <= 0) return "now";
  const seconds = Math.floor(deltaMs / 1000);
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `${days}d ${Math.floor((seconds % 86400) / 3600)}h`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 1) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function CountdownTimer({ targetIsoUtc, label, expiredLabel = "Expired" }: { targetIsoUtc: string; label?: string; expiredLabel?: string }) {
  const target = new Date(targetIsoUtc).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = target - now;
  const text = remaining <= 0 ? expiredLabel : formatRemaining(remaining);
  return (
    <time className="countdown" dateTime={targetIsoUtc} aria-live="polite">
      {label ? <span className="countdown-label">{label} </span> : null}
      {text}
    </time>
  );
}
