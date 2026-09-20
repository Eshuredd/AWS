import type { Metadata, Viewport } from "next";
import { Icon } from "@/components/ui";
import Link from "next/link";
import HeaderNav from "@/components/header-nav";
import RecentRideRecorder from "@/components/recent-ride-recorder";
import "./globals.css";
import "./map-history.css";

export const metadata: Metadata = {
  title: "RideWatch | Know your ride",
  description: "A booking-independent ride safety companion for India.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F3F6F4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <RecentRideRecorder />
        <div className="app-shell">
          <header className="app-header">
            <Link href="/" className="brand" aria-label="RideWatch home">
              <span className="brand-mark"><Icon name="route" /></span>
              <span className="brand-copy">
                <strong>RideWatch</strong>
                <span>Ride safety companion</span>
              </span>
            </Link>
            <HeaderNav />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
