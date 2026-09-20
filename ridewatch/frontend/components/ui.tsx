import type { ReactNode } from "react";

type IconName = "route" | "location" | "check" | "back" | "shield" | "clock" | "car" | "info";

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    route: "M6 18V9a4 4 0 0 1 4-4h8m-4-4 4 4-4 4",
    location: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3",
    check: "m5 12 4 4L19 6",
    back: "m12 5-7 7 7 7M5 12h14",
    shield: "M12 3 5.5 5.7v5.8c0 4.1 2.7 7.2 6.5 9.5 3.8-2.3 6.5-5.4 6.5-9.5V5.7L12 3Z",
    clock: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    car: "M5 16h14l-1.1-5.2a2 2 0 0 0-2-1.6H8.1a2 2 0 0 0-2 1.6L5 16Zm2 0v2m10-2v2M8.5 13h.01m6.99 0h.01",
    info: "M12 11v5m0-8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  };

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
      {name === "route" && <circle cx="6" cy="20" r="2" />}
    </svg>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="loading-state" role="status">
      <div className="loading-copy">
        <span className="loading-dot" aria-hidden="true" />
        <p>{label}</p>
      </div>
      <div className="skeleton" aria-hidden="true" />
      <div className="skeleton short" aria-hidden="true" />
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice" role="alert">{children}</div>;
}
