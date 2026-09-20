import type { Metadata, Viewport } from "next";
import { Icon } from "@/components/ui";
import "./globals.css";
export const metadata: Metadata = { title: "RideWatch | Know your ride", description: "A booking-independent ride safety companion for India." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F5F6F2" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><div className="app-shell"><header className="app-header"><span className="brand"><span className="brand-mark"><Icon name="route"/></span>RideWatch</span></header>{children}</div></body></html>;
}
