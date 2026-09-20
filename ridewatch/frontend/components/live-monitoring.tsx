"use client";
import { useEffect, useState } from "react";
import { getMonitoring, sendLocation, type Monitoring, type RouteEstimate } from "@/lib/api";
import { startTracking } from "@/lib/live-tracking";
import { monitoringPresentation } from "@/lib/monitoring-presentation";
import RoutePreview from "./route-preview";
export default function LiveMonitoring({ rideId, route }: { rideId: string; route: RouteEstimate }) {
  const [state, setState] = useState<Monitoring | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const stop = startTracking({ geolocation: navigator.geolocation,
      send: (sample, signal) => sendLocation(rideId, sample, signal),
      onState: value => { setState(value); setNow(Date.now()); }, onError: setError });
    const controller = new AbortController();
    let pending = false;
    const timer = window.setInterval(async () => {
      setNow(Date.now());
      if (pending) return;
      pending = true;
      try {
        const next = await getMonitoring(rideId, controller.signal);
        if (!controller.signal.aborted) {
          setPollError("");
          setState(previous => !previous?.last_updated_at || !next.last_updated_at || next.last_updated_at >= previous.last_updated_at ? next : previous);
        }
      } catch { if (!controller.signal.aborted) setPollError("Could not reach RideWatch. Retrying automatically."); }
      finally { pending = false; }
    }, 10000);
    return () => { stop(); controller.abort(); window.clearInterval(timer); };
  }, [rideId, attempt]);
  const issue = error || pollError;
  const view = monitoringPresentation(state, issue, now);
  return <section aria-label="Live monitoring">
    <div className={`status-headline status-${view.tone}`} role="status"><span className="status-dot" aria-hidden="true"/><h1 key={view.headline} className="enter">{view.headline}</h1></div>
    <p className="fine monitoring-freshness">{state?.last_updated_at ? `Location updated ${new Date(state.last_updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</p>
    {(issue || !view.reliable || view.tone === "danger") && <p className="support status-description">{issue || (view.tone === "danger" ? "Check the route with your driver when it is safe to do so." : view.unavailable ? "No recent reliable reading. Your ride is still active." : state?.gps_status === "POOR" ? "Poor signal. Route checks will resume with a reliable reading." : "Keep this page open while we find your position.")}</p>}
    <RoutePreview route={route} uncertain={!view.reliable}/>
    {state && <dl className="monitoring-facts">
      {view.route !== view.headline && <div><dt>Route</dt><dd>{view.route}</dd></div>}
      <div><dt>Movement</dt><dd>{view.movement}</dd></div><div><dt>Timing</dt><dd>{view.timing}</dd></div>
    </dl>}
    {(view.unavailable || state?.gps_status === "POOR" || issue) && <button type="button" className="text-button" onClick={() => { setError(""); setPollError(""); setState(null); setAttempt(v => v + 1); }}>Restart monitoring</button>}
  </section>;
}
