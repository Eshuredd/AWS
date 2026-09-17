"use client";
import { useEffect, useState } from "react";
import { calculateRoute, type Coordinates, type RouteEstimate } from "@/lib/api";

type RouteState = { key: string; estimate: RouteEstimate | null; error: string };
export function useRouteEstimate(start: Coordinates | null, destination: Coordinates | null) {
  const [state, setState] = useState<RouteState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([start, destination, attempt]);
  const ready = !!start && !!destination;
  const current = ready && state?.key === key ? state : null;
  useEffect(() => {
    if (!start || !destination) return;
    const controller = new AbortController();
    calculateRoute(start, destination, controller.signal).then(estimate => {
      if (!controller.signal.aborted) setState({ key, estimate, error: "" });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({ key, estimate: null, error: error.message });
    });
    return () => controller.abort();
  }, [start, destination, key]);
  return { estimate: current?.estimate ?? null, error: current?.error ?? "",
    loading: ready && !current, retry: () => setAttempt(value => value + 1) };
}
