import type { ReactNode } from "react";
import "./globals.css";
import { WalletStatus } from "../components/wallet/WalletStatus";

export const metadata = {
  title: "World Cup Prediction Market",
  description: "2026 World Cup live goal-window prediction market MVP",
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
        <nav className="nav">
          <div className="nav-shell">
            <a className="nav-brand" href="/">World Cup Prediction Market</a>
            <div className="nav-links" aria-label="Primary navigation">
              <a href="/">Home</a>
              <a href="/schedule">Schedule</a>
              <a href="/live">Live</a>
              <a href="/portfolio">Portfolio</a>
              <a href="/settlement">Settlement</a>
              <a href="/operator">Operator</a>
            </div>
            <div className="nav-actions">
              <WalletStatus connected={false} chainId={31337} />
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
