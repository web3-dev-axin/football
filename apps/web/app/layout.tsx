import type { ReactNode } from "react";
import Link from "next/link";
import "@heroui/react/styles";
import "./globals.css";
import { BrandMark } from "../components/ui/BrandMark";
import { SiteNavigation } from "../components/ui/SiteNavigation";
import { NavigationProgress } from "../components/ui/NavigationProgress";
import { WalletProvider } from "../components/wallet/WalletProvider";
import { WalletPill } from "../components/wallet/WalletPill";

export const metadata = {
  title: "polygoal",
  description: "2026 World Cup match winner and exact score prediction market",
  icons: {
    icon: [
      { url: "/brand/logo-mark-green.png", type: "image/png" },
    ],
    shortcut: "/brand/logo-mark-green.png",
    apple: "/brand/logo-mark-green.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <NavigationProgress />
          <nav className="nav">
            <div className="nav-shell">
              <Link className="nav-brand" href="/" aria-label="polygoal home" prefetch>
                <BrandMark />
              </Link>
              <SiteNavigation variant="desktop" />
              <div className="nav-actions">
                <WalletPill />
              </div>
            </div>
          </nav>
          {children}
          <SiteNavigation variant="mobile" />
        </WalletProvider>
      </body>
    </html>
  );
}
