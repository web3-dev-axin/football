"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Markets", match: (path: string) => path === "/" || path.startsWith("/markets") || path.startsWith("/matches") },
  { href: "/portfolio", label: "Portfolio", match: (path: string) => path.startsWith("/portfolio") },
  { href: "/settlements", label: "Settlements", match: (path: string) => path.startsWith("/settlements") },
];

export function SiteNavigation({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname() ?? "/";

  if (variant === "mobile") {
    return (
      <nav className="mobile-tabbar" aria-label="Primary mobile navigation">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link className={active ? "mobile-tab active" : "mobile-tab"} href={item.href} aria-current={active ? "page" : undefined} key={item.href} prefetch>
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="nav-links" aria-label="Primary navigation">
      {navItems.map((item) => {
        const active = item.match(pathname);
        return (
          <Link className={active ? "nav-link active" : "nav-link"} href={item.href} aria-current={active ? "page" : undefined} key={item.href} prefetch>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
