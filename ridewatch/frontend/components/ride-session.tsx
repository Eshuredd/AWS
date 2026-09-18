"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FareSummary from "@/components/fare-summary";
import FareReportForm from "@/components/fare-report-form";
import { captureDropLocation, endRide, getRide, formatDistance, formatDuration, type Ride } from "@/lib/api";
export default function RideSession({ rideId }: { rideId: string }) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    getRide(rideId, controller.signal).then(value => { if (!controller.signal.aborted) setRide(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [rideId, attempt]);
  async function finish() {
    if (ending.current) return;
    ending.current = true; setBusy(true); setError("");
    try { const drop = await captureDropLocation(); setRide(await endRide(rideId, drop)); } catch (e) { setError(e instanceof Error ? e.message : "Unable to end ride."); }
    finally { ending.current = false; setBusy(false); }
  }
  const complete = ride?.status === "COMPLETED";
  const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return <main className="mx-auto max-w-xl"><Link href="/" className="inline-block py-3 text-sm text-teal-700">← Back to RideWatch</Link>{error && <div className="my-4 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert"><p>{error}</p>{!ride && <button className="secondary mt-3" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button>}</div>}{!ride ? <p role="status" className="py-10">{error ? "Ride unavailable" : "Loading your ride…"}</p> : <><div className="my-6"><span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800">{ride.status}</span><h1 className="mt-4 text-3xl font-bold">{complete ? "Ride completed" : "Ride in progress"}</h1><p className="mt-2 text-stone-600">{complete ? "You’ve reached the end of this ride session." : "Your ride details, all in one place."}</p></div><section className="card"><h2 className="mb-5 font-bold">Your ride</h2><dl className="space-y-5"><div><dt className="text-sm text-stone-500">Destination</dt><dd className="mt-1 break-words text-xl font-semibold">{ride.destination}</dd></div><div><dt className="text-sm text-stone-500">Vehicle</dt><dd className="mt-1 font-semibold">{ride.vehicle_number || "Not provided"}</dd></div><div><dt className="text-sm text-stone-500">Expected distance</dt><dd className="mt-1 font-semibold">{ride.expected_distance_km != null ? `${formatDistance(ride.expected_distance_km)} km` : "Not recorded"}</dd></div><div><dt className="text-sm text-stone-500">Expected duration</dt><dd className="mt-1 font-semibold">{ride.expected_duration_minutes != null ? formatDuration(ride.expected_duration_minutes) : "Not recorded"}</dd></div><div><dt className="text-sm text-stone-500">Started</dt><dd className="mt-1">{date(ride.started_at)}</dd></div>{ride.ended_at && <div><dt className="text-sm text-stone-500">Ended</dt><dd className="mt-1">{date(ride.ended_at)}</dd></div>}</dl><div className="mt-5"><FareSummary estimate={ride.fare_estimate} snapshot/></div></section>{complete && ride.expected_distance_km != null && <FareReportForm rideId={rideId}/>} {!complete && <><section className="card mt-4"><h2 className="font-bold">Route monitoring <span className="ml-2 text-xs font-normal text-stone-500">Coming later</span></h2><p className="mt-2 text-sm text-stone-600">Route monitoring will appear here.</p></section><section className="card mt-4"><h2 className="font-bold">Safety monitoring <span className="ml-2 text-xs font-normal text-stone-500">Preview only</span></h2><p className="mt-2 text-sm text-stone-600">Planned status: “RideWatch is monitoring this trip.”</p><p className="mt-2 text-xs leading-5 text-stone-500">Monitoring is not active in this MVP. No location tracking, safety alerts or emergency response is running.</p></section><button className="primary mt-6" onClick={finish} disabled={busy}>{busy ? "ENDING RIDE…" : "END RIDE"}</button></>}{complete && <Link href="/" className="primary mt-6 block text-center">START ANOTHER RIDE</Link>}</>}</main>;
}
