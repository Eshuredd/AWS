"use client";

import { useEffect, useState } from "react";
import { formatDistance, formatDuration, getSharedRide, type SharedRide } from "@/lib/api";
import { Notice, Skeleton } from "./ui";

const labels = {
  route: { UNKNOWN: "Unknown", ON_ROUTE: "On expected route", POSSIBLE_DEVIATION: "Possible deviation", DEVIATED: "Route deviation detected" },
  stop: { UNKNOWN: "Unknown", MOVING: "Moving", PROLONGED_STOP: "Prolonged stop detected" },
  delay: { UNKNOWN: "Unknown", ON_TIME: "On time", DELAYED: "Delayed" },
} as const;

export default function SharedTrip({ token }: { token: string }) {
  const [ride, setRide] = useState<SharedRide | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const controller = new AbortController(); let timer: number | undefined;
    const load = async () => {
      try {
        const value = await getSharedRide(token, controller.signal);
        if (controller.signal.aborted) return;
        setRide(value); setError(""); setNow(Date.now());
        if (value.ride_status === "ACTIVE") timer = window.setTimeout(load, 9000);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "This live trip is unavailable."); }
    };
    load();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); if (timer) window.clearTimeout(timer); window.clearInterval(clock); };
  }, [token]);
  if (!ride) return <main id="main" className="workspace shared-workspace" tabIndex={-1}><div className="context"><p className="eyebrow">RideWatch</p><h1>Shared live trip</h1></div><div className="sheet">{error ? <Notice>{error}</Notice> : <Skeleton label="Loading shared trip…" />}</div></main>;
  const updated = ride.last_updated_at ? Date.parse(ride.last_updated_at) : NaN;
  const stale = ride.gps_status === "STALE" || ride.gps_status === "UNAVAILABLE" || Number.isFinite(updated) && now - updated > 30000;
  const age = Number.isFinite(updated) ? Math.max(0, Math.floor((now - updated) / 1000)) : null;
  const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return <main id="main" className="workspace shared-workspace" tabIndex={-1}>
    <div className="context shared-context"><p className="eyebrow">RideWatch</p><h1>Shared live trip</h1><p className="support">{ride.ride_status === "ACTIVE" ? "Ride in progress" : "This ride has ended"}</p></div>
    <div className="sheet stack">
      <div><p className="eyebrow">Heading to</p><h2 className="session-destination">{ride.destination}</h2></div>
      <dl className="detail-list"><div><dt>Vehicle</dt><dd>{ride.vehicle_number || "Not provided"}</dd></div><div><dt>Started</dt><dd>{date(ride.started_at)}</dd></div>{ride.ended_at && <div><dt>Ended</dt><dd>{date(ride.ended_at)}</dd></div>}</dl>
      <dl className="monitoring-facts" aria-label="Live status"><div className="monitoring-fact"><dt>Route</dt><dd>{labels.route[ride.route_status]}</dd></div><div className="monitoring-fact"><dt>Movement</dt><dd>{labels.stop[ride.stop_status]}</dd></div><div className="monitoring-fact"><dt>Timing</dt><dd>{labels.delay[ride.delay_status]}</dd></div></dl>
      <p className="support" aria-live="polite">{age == null ? "Waiting for a location update" : `Updated ${age} second${age === 1 ? "" : "s"} ago`}</p>
      {stale && <Notice>GPS location is stale. The shown location may be outdated.</Notice>}
      {ride.current_location ? <div className="shared-location"><a className="secondary wide" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${ride.current_location.latitude},${ride.current_location.longitude}`}>Open current location in Maps</a><p className="help">Approx. ±{Math.round(ride.current_location.accuracy_m)} m</p></div> : <p className="support">Current location is unavailable.</p>}
      <dl className="metric-pair"><div><dt>Expected distance</dt><dd>{ride.expected_distance_km == null ? "Not recorded" : `${formatDistance(ride.expected_distance_km)} km`}</dd></div><div><dt>Expected duration</dt><dd>{ride.expected_duration_minutes == null ? "Not recorded" : formatDuration(ride.expected_duration_minutes)}</dd></div></dl>
      <p className="fine">This read-only page cannot update location, end the ride, or contact emergency services.</p>
    </div>
  </main>;
}
