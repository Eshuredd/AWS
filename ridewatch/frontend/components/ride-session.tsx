"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import LiveMonitoring from "./live-monitoring";
import FareSummary from "./fare-summary";
import FareReportForm from "./fare-report-form";
import ConfirmDialog from "./confirm-dialog";
import RoutePreview from "./route-preview";
import { Icon, Notice, Skeleton } from "./ui";
import { captureDropLocation, endRide, getRide, formatDistance, formatDuration, type Ride } from "@/lib/api";
import type { Monitoring } from "@/lib/api";
import EmergencyAssistance, { useRideShare } from "./emergency-assistance";
export default function RideSession({ rideId }: { rideId: string }) {
  const router = useRouter();
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<"end" | "leave" | null>(null);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dismissedAlert, setDismissedAlert] = useState("");
  const ending = useRef(false);
  const complete = ride?.status === "COMPLETED";
  const sharing = useRideShare(ride);
  const monitoringUpdate = useCallback((value: Monitoring) => setMonitoring(value), []);
  useEffect(() => {
    const controller = new AbortController();
    getRide(rideId, controller.signal).then(value => { if (!controller.signal.aborted) setRide(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [rideId, attempt]);
  useEffect(() => {
    if (!ride || complete) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ride, complete]);
  async function finish() {
    if (ending.current) return;
    setConfirm(null); ending.current = true; setBusy(true); setError("");
    try { const drop = await captureDropLocation(); setRide(await endRide(rideId, drop)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to end ride."); }
    finally { ending.current = false; setBusy(false); }
  }
  const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (!ride) return <main id="main" tabIndex={-1} className="workspace"><div className="context"><h1>{error ? "Ride unavailable" : "Opening your ride"}</h1><Link href="/" className="text-button">Back to RideWatch</Link></div><div className="sheet">{error ? <Notice><p>{error}</p><button className="secondary" onClick={() => { setError(""); setAttempt(v => v + 1); }}>Try again</button></Notice> : <Skeleton label="Loading your ride…"/>}</div></main>;
  const details = <details><summary>Ride details</summary><div className="disclosure-content"><dl className="detail-list"><div><dt>Vehicle</dt><dd>{ride.vehicle_number || "Not provided"}</dd></div><div><dt>Started</dt><dd>{date(ride.started_at)}</dd></div>{ride.ended_at && <div><dt>Ended</dt><dd>{date(ride.ended_at)}</dd></div>}</dl><FareSummary estimate={ride.fare_estimate} snapshot/></div></details>;
  const metrics = <dl className="metric-pair"><div><dt>Expected distance</dt><dd>{ride.expected_distance_km != null ? `${formatDistance(ride.expected_distance_km)} km` : "Not recorded"}</dd></div><div><dt>Expected duration</dt><dd>{ride.expected_duration_minutes != null ? formatDuration(ride.expected_duration_minutes) : "Not recorded"}</dd></div></dl>;
  const alertKey = monitoring && (monitoring.route_status === "DEVIATED" || monitoring.stop_status === "PROLONGED_STOP" || monitoring.delay_status === "DELAYED")
    ? `${monitoring.route_status}:${monitoring.stop_status}:${monitoring.delay_status}` : "";
  return <main id="main" className="workspace" tabIndex={-1}>
    <div className={`context ${complete ? "completion-context" : "session-context"}`}>
      <div className="session-topline">{complete ? <Link href="/" className="text-button"><Icon name="back"/>Back to RideWatch</Link> : <button className="text-button" disabled={busy} onClick={() => setConfirm("leave")}><Icon name="back"/>Leave session</button>}<span className="session-label">{complete ? "Journey finished" : "Ride in progress"}</span></div>
      {complete ? <><div className="completion-mark"><Icon name="check"/></div><h1>Ride completed</h1><p className="support">Monitoring stopped. Your ride details are saved.</p><div className="completion-route"><RoutePreview route={ride.expected_route}/></div></> : busy ? <><h1>Ending your ride</h1><p className="support status-description" role="status">Saving your drop-off location. Monitoring has paused.</p><RoutePreview route={ride.expected_route} uncertain/><p className="support">Keep this page open while your journey is saved.</p></> : ride.expected_route?.traffic_aware ? <LiveMonitoring rideId={rideId} route={ride.expected_route} onUpdate={monitoringUpdate}/> : <><h1>Monitoring unavailable for this ride</h1><p className="support">This ride has no validated route. You can still end your session.</p></>}
    </div>
    <div className="sheet session-panel">
      <p className="eyebrow">{complete ? "Your destination" : "Heading to"}</p><h2 className="session-destination">{ride.destination}</h2>
      {metrics}
      {error && <Notice>{error} Your ride is still active. Try ending it again.</Notice>}
      {complete ? <div className="stack">{ride.ended_at && <p className="support">Ended {date(ride.ended_at)}</p>}{ride.expected_distance_km != null ? <FareReportForm rideId={rideId}/> : <Link href="/" className="primary">Start another ride</Link>}{details}</div> : <>
        {details}
        {alertKey && dismissedAlert !== alertKey && <div className="unusual-prompt" role="alert"><strong>Something looks unusual.</strong><p>Review the live status and choose what you want to do.</p><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setDismissedAlert(alertKey)}>I&apos;m okay</button><button type="button" className="sos-button" onClick={() => setHelpOpen(true)}>Get help</button></div></div>}
        {sharing.token && <div className="sharing-state"><p><strong>Live trip sharing</strong><span><span className="sharing-dot" aria-hidden="true" /> On</span></p><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setHelpOpen(true)}>Share again</button><button type="button" className="secondary" disabled={sharing.busy} onClick={sharing.stop}>Stop sharing</button></div>{sharing.error && <p className="help error-text">{sharing.error}</p>}</div>}
        <p className="support">Keep this page open for location checks. RideWatch does not automatically contact emergency services.</p>
        <div className="action-dock emergency-actions"><button type="button" className="sos-button" onClick={() => setHelpOpen(true)} disabled={busy}>Get help / SOS</button><button className="primary" onClick={() => setConfirm("end")} disabled={busy}>{busy ? "Ending ride…" : "End ride"}</button><p className="help">{busy ? "Keep this page open while we save your ride." : "Monitoring stops when you end the ride."}</p></div>
      </>}
    </div>
    {confirm && <ConfirmDialog
      title={confirm === "end" ? "End this ride?" : "Leave this session?"}
      description={confirm === "end" ? "Monitoring will stop and your ride will be marked complete." : "Monitoring pauses when you leave this page. Your ride stays active; keep the ride link to return."}
      confirm={confirm === "end" ? "End ride" : "Leave session"}
      cancel={confirm === "end" ? "Keep riding" : "Keep ride open"}
      onClose={() => setConfirm(null)}
      onConfirm={confirm === "end" ? finish : () => router.push("/")}
    />}
    <EmergencyAssistance ride={ride} monitoring={monitoring} open={helpOpen} onClose={() => setHelpOpen(false)} sharing={sharing}/>
  </main>;
}
