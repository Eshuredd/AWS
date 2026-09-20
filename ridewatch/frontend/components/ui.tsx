import type { ReactNode } from "react";
export function Icon({ name }: { name: "route" | "location" | "check" | "back" }) {
  const paths = { route: "M6 18V9a4 4 0 0 1 4-4h8m-4-4 4 4-4 4", location: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3", check: "m5 12 4 4L19 6", back: "m12 5-7 7 7 7M5 12h14" };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/>{name === "route" && <circle cx="6" cy="20" r="2"/>}</svg>;
}
export function Skeleton({ label }: { label: string }) {
  return <div className="loading-state" role="status"><p>{label}</p><div className="skeleton" aria-hidden="true"/><div className="skeleton short" aria-hidden="true"/></div>;
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice" role="alert">{children}</div>;
}
