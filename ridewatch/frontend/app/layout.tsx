import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = { title: "RideWatch | Know your ride", description: "A booking-independent ride safety companion for India." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="mx-auto max-w-5xl px-5 py-7 sm:px-10 sm:py-10"><header className="mb-10 flex items-center justify-between gap-4"><Link href="/" className="flex items-center gap-3 font-bold text-xl tracking-tight"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-800 text-white" aria-hidden="true">↗</span>RideWatch</Link><span className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600">EARLY PREVIEW</span></header>{children}<footer className="mt-10 border-t border-stone-200 pt-5 text-xs leading-6 text-stone-500">Made for the rides you find your own way.<br/>RideWatch MVP · No live tracking or emergency response yet.</footer></div></body></html>;
}
