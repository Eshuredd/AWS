"use client";

import { useEffect, useState } from "react";
import { getMonitoring, sendLocation, type Monitoring, type RouteEstimate } from "@/lib/api";
import { startTracking } from "@/lib/live-tracking";
import { monitoringPresentation } from "@/lib/monitoring-presentation";
import RoutePreview from "./route-preview";

export default function LiveMonitoring({ rideId, route, onUpdate }: { rideId: string; route: RouteEstimate; onUpdate?: (state: Monitoring) => void }) {
  const [state, setState] = useState<Monitoring | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stop = startTracking({
      geolocation: navigator.geolocation,
      send: (sample, signal) => sendLocation(rideId, sample, signal),
      onState: value => {
        setState(value);
        onUpdate?.(value);
        setNow(Date.now());
      },
      onError: setError,
    });

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
      } catch {
        if (!controller.signal.aborted) setPollError("Could not reach RideWatch. Retrying automatically.");
      } finally {
        pending = false;
      }
    }, 10000);

    return () => {
      stop();
      controller.abort();
      window.clearInterval(timer);
    };
  }, [rideId, attempt, onUpdate]);

  const issue = error || pollError;
  const view = monitoringPresentation(state, issue, now);

  return (
    <section className={`live-monitoring live-${view.tone}`} aria-label="Live monitoring">
      <div className="live-topline">
        <span className={`live-chip status-${view.tone}`}>
          <span className="live-chip-dot" aria-hidden="true" />
          Live ride check
        </span>
        <span className="fine monitoring-freshness">
          {state?.last_updated_at
            ? `Updated ${new Date(state.last_updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
            : "Waiting for first reading"}
        </span>
      </div>

      <div className={`status-headline status-${view.tone}`} role="status">
        <span className="status-dot" aria-hidden="true" />
        <h1 key={view.headline} className="enter">{view.headline}</h1>
      </div>

      {(issue || !view.reliable || view.tone === "danger") && (
        <p className="support status-description">
          {issue || (
            view.tone === "danger"
              ? "Check the route with your driver when it is safe to do so."
              : view.unavailable
                ? "No recent reliable reading. Your ride is still active."
                : state?.gps_status === "POOR"
                  ? "Poor signal. Route checks will resume with a reliable reading."
                  : "Keep this page open while we find your position."
          )}
        </p>
      )}

      <RoutePreview route={route} uncertain={!view.reliable} />

      {state && (
        <dl className="monitoring-facts">
          {view.route !== view.headline && (
            <div className="monitoring-fact">
              <dt><span className="fact-node" aria-hidden="true" />Route</dt>
              <dd>{view.route}</dd>
            </div>
          )}
          <div className="monitoring-fact">
            <dt><span className="fact-node" aria-hidden="true" />Movement</dt>
            <dd>{view.movement}</dd>
          </div>
          <div className="monitoring-fact">
            <dt><span className="fact-node" aria-hidden="true" />Timing</dt>
            <dd>{view.timing}</dd>
          </div>
        </dl>
      )}

      {(view.unavailable || state?.gps_status === "POOR" || issue) && (
        <button
          type="button"
          className="text-button restart-button"
          onClick={() => {
            setError("");
            setPollError("");
            setState(null);
            setAttempt(value => value + 1);
          }}
        >
          Restart monitoring
        </button>
      )}
    </section>
  );
}
