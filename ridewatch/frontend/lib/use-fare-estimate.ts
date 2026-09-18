"use client";
import { useEffect, useState } from "react";
import { estimateFare, type Coordinates, type FareEstimate, type RouteEstimate } from "@/lib/api";

export function useFareEstimate(start: Coordinates | null, destination: Coordinates | null, route: RouteEstimate | null) {
  const [state, setState] = useState<{ key: string; estimate: FareEstimate | null; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([start, destination, route, attempt]);
  const ready = !!start && !!destination && !!route;
  const current = ready && state?.key === key ? state : null;
  useEffect(() => {
    if (!start || !destination || !route) return;
    const controller = new AbortController();
    estimateFare(start, destination, route, controller.signal).then(estimate => {
      if (!controller.signal.aborted) setState({ key, estimate, error: "" });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({ key, estimate: null, error: error.message });
    });
    return () => controller.abort();
  }, [start, destination, route, key]);
  return { estimate: current?.estimate ?? null, error: current?.error ?? "", loading: ready && !current, retry: () => setAttempt(value => value + 1) };
}
