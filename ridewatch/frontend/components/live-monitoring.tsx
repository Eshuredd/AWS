"use client";
import { useEffect, useState } from "react";
import { getMonitoring, sendLocation, type Monitoring } from "@/lib/api";
import { startTracking } from "@/lib/live-tracking";

export default function LiveMonitoring({ rideId }: { rideId: string }) {
  const [state, setState] = useState<Monitoring | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const stop = startTracking({ geolocation: navigator.geolocation,
      send: (sample, signal) => sendLocation(rideId, sample, signal),
      onState: setState, onError: setError });
    const controller = new AbortController();
    // Aggregate polling keeps delay/staleness current even when GPS is silent.
    let pending = false;
    const timer = window.setInterval(async () => {
      setNow(Date.now());
      if (pending) return;
      pending = true;
      try {
        const next = await getMonitoring(rideId, controller.signal);
        if (!controller.signal.aborted) setState(previous => !previous?.last_updated_at || !next.last_updated_at || next.last_updated_at >= previous.last_updated_at ? next : previous);
      } catch { if (!controller.signal.aborted) setError("Live monitoring unavailable: could not reach RideWatch."); }
      finally { pending = false; }
    }, 10000);
    return () => { stop(); controller.abort(); window.clearInterval(timer); };
  }, [rideId, attempt]);
  const stale = !!state?.last_updated_at && now - Date.parse(state.last_updated_at) > 30000;
  const unavailable = !!error || stale || state?.gps_status === "STALE" || state?.gps_status === "UNAVAILABLE";
  const labels = {
    UNKNOWN: "Waiting for reliable readings", ON_ROUTE: "On expected route", POSSIBLE_DEVIATION: "Checking possible deviation", DEVIATED: "Route deviation detected",
    MOVING: "No prolonged stop detected", PROLONGED_STOP: "Prolonged stop detected", ON_TIME: "Within expected time", DELAYED: "Significant delay detected",
    GOOD: "Active", POOR: "Poor signal", WAITING: "Waiting for GPS", STALE: "No recent readings", UNAVAILABLE: "Unavailable",
  };
  return <section className="card mt-4" aria-label="Live monitoring"><h2 className="font-bold">Live monitoring</h2>
    {unavailable && <p role="status" className="mt-3 text-sm text-amber-800">{error || "Live monitoring unavailable: no recent reliable update."}</p>}
    <dl className="mt-4 grid grid-cols-2 gap-4" aria-live="polite">
      <div><dt className="text-sm text-stone-500">GPS</dt><dd>{unavailable ? "Unavailable" : labels[state?.gps_status ?? "WAITING"]}</dd></div>
      <div><dt className="text-sm text-stone-500">Route</dt><dd>{unavailable ? "Waiting for monitoring" : labels[state?.route_status ?? "UNKNOWN"]}</dd></div>
      <div><dt className="text-sm text-stone-500">Movement</dt><dd>{unavailable ? "Waiting for monitoring" : labels[state?.stop_status ?? "UNKNOWN"]}</dd></div>
      <div><dt className="text-sm text-stone-500">Timing</dt><dd>{error ? "Waiting for monitoring" : labels[state?.delay_status ?? "UNKNOWN"]}</dd></div>
    </dl><p className="mt-4 text-xs text-stone-500">Latest GPS update: {state?.last_updated_at ? new Date(state.last_updated_at).toLocaleTimeString() : "Waiting"}</p>
    <p className="mt-2 text-xs text-stone-500">Informational signals, not emergency guarantees. Keep this page open; background tracking may pause.</p>
    <button type="button" className="secondary mt-3" onClick={() => { setError(""); setState(null); setAttempt(value => value + 1); }}>Restart monitoring</button>
  </section>;
}
