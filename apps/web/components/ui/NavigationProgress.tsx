"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastKeyRef = useRef<string>("");

  // intercept anchor clicks so we start the bar as soon as the user clicks an internal link
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      startProgress();
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // when route key changes, complete the bar
  useEffect(() => {
    const key = `${pathname}?${searchParams?.toString() ?? ""}`;
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      completeProgress();
    }
    lastKeyRef.current = key;
  }, [pathname, searchParams]);

  function startProgress() {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setPending(true);
    setProgress(8);
    tickTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (prev < 60 ? Math.random() * 8 + 2 : prev < 85 ? Math.random() * 2 + 0.4 : 0.2);
        return Math.min(next, 92);
      });
    }, 220);
  }

  function completeProgress() {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setProgress(100);
    completionTimerRef.current = setTimeout(() => {
      setPending(false);
      setProgress(0);
    }, 360);
  }

  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

  return (
    <div className="nav-progress" data-active={pending ? "true" : "false"} aria-hidden="true">
      <div className="nav-progress-bar" style={{ transform: `scaleX(${progress / 100})`, opacity: progress > 0 ? 1 : 0 }} />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
