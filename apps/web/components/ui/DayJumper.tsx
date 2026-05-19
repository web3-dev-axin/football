"use client";

import { useEffect, useRef, useState } from "react";

export type DayJumperItem = {
  id: string;
  label: string;
  sublabel: string;
  count: number;
  tone?: "live";
  isToday?: boolean;
};

export function DayJumper({ items }: { items: DayJumperItem[] }) {
  const [activeId, setActiveId] = useState<string | undefined>(items[0]?.id);
  const listRef = useRef<HTMLUListElement>(null);
  const pillRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // Scroll-spy: track which day section is currently in view and highlight its pill.
  useEffect(() => {
    if (items.length === 0) return;
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Section becomes "active" once its top is in the upper third of the viewport
      { rootMargin: "-18% 0px -64% 0px", threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  // Whenever the active pill changes, scroll it into horizontal center of the strip
  // so the user can always see what's active without manually scrolling the strip.
  useEffect(() => {
    if (!activeId) return;
    const pill = pillRefs.current[activeId];
    const list = listRef.current;
    if (!pill || !list) return;
    const pillRect = pill.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const desiredScrollLeft = list.scrollLeft + pillRect.left - listRect.left - (listRect.width - pillRect.width) / 2;
    list.scrollTo({ left: Math.max(0, desiredScrollLeft), behavior: "smooth" });
  }, [activeId]);

  if (items.length === 0) return null;

  return (
    <nav className="day-jumper" aria-label="Jump to date">
      <ul className="day-jumper-list" ref={listRef}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          const classes = [
            "day-jumper-pill",
            item.tone === "live" ? "is-live" : "",
            item.isToday ? "is-today" : "",
            isActive ? "is-active" : "",
          ].filter(Boolean).join(" ");
          return (
            <li key={item.id} className="day-jumper-item">
              <a
                ref={(el) => { pillRefs.current[item.id] = el; }}
                className={classes}
                href={`#${item.id}`}
                aria-current={isActive ? "true" : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  const target = document.getElementById(item.id);
                  if (!target) return;
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActiveId(item.id);
                  if (typeof window !== "undefined") {
                    window.history.replaceState(null, "", `#${item.id}`);
                  }
                }}
              >
                <span className="day-jumper-pill-head">
                  {item.tone === "live" ? <span className="day-jumper-dot" aria-hidden /> : null}
                  <span className="day-jumper-label">{item.label}</span>
                </span>
                <span className="day-jumper-meta">
                  {item.tone === "live"
                    ? `${item.count} live now`
                    : `${item.count} ${item.count === 1 ? "match" : "matches"}`}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
