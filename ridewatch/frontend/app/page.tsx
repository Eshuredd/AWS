"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createRide, normalizeVehicle, validVehicle } from "@/lib/api";
export default function Home() {
  const router = useRouter();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [destination, setDestination] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const ready = !!location && !!destination.trim();
  const vehicleValid = validVehicle(normalizeVehicle(vehicle));
  function locate() {
    setLocationError("");
    if (!navigator.geolocation) { setLocationError("Location is unavailable in this browser. Try a browser with location support."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => { setLocation({ latitude: coords.latitude, longitude: coords.longitude }); setLocating(false); }, (failure) => {
      setLocating(false);
      setLocationError(failure.code === 1 ? "Location permission was denied. Enable location access in your browser settings, then try again." : failure.code === 3 ? "Finding your location took too long. Please try again." : "Your location is unavailable. Check your device location settings and try again.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location || !ready || !vehicleValid || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { const ride = await createRide({ start_lat: location.latitude, start_lng: location.longitude, destination: destination.trim(), vehicle_number: normalizeVehicle(vehicle) || null }); router.push(`/ride/${ride.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to start ride."); submitting.current = false; setBusy(false); }
  }
  return <main><div className="mb-8"><p className="mb-3 text-xs font-bold tracking-[.18em] text-teal-700">YOUR RIDE. A LITTLE MORE REASSURANCE.</p><h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Know your ride<br className="hidden sm:block"/> before you get in.</h1><p className="mt-4 max-w-lg leading-7 text-stone-600">Street-hailed auto or a local cab. Start with the details, wherever you book your ride.</p></div>
    <div className="grid gap-6 md:grid-cols-[1.15fr_1fr]"><form onSubmit={start} className="card space-y-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Let’s get you ready</h2><span className="text-xs text-stone-500">01 / RIDE DETAILS</span></div>
      <div><h3 className="mb-3 text-sm font-bold">Current location</h3><div className="rounded-2xl bg-stone-50 p-4"><p className="mb-3 text-sm text-stone-600" role="status">{locating ? "Finding your location…" : location ? "Current location detected" : "Add your starting point with one tap."}</p><button type="button" onClick={locate} disabled={locating || busy} className="secondary w-full">{locating ? "Finding location…" : location ? "Refresh my location" : "Use my location"}</button></div>{locationError && <p role="alert" className="mt-2 text-sm text-red-700">{locationError}</p>}</div>
      <div><label htmlFor="destination" className="mb-2 block text-sm font-bold">Where are you going?</label><input id="destination" placeholder="e.g. Secunderabad Railway Station" value={destination} onChange={e => setDestination(e.target.value)} maxLength={200} required disabled={busy}/></div>
      <div><label htmlFor="vehicle" className="mb-2 block text-sm font-bold">Vehicle number <span className="font-normal text-stone-500">(optional)</span></label><input id="vehicle" placeholder="TS 09 AB 1234" value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} onBlur={() => setVehicle(normalizeVehicle(vehicle))} maxLength={30} aria-invalid={!vehicleValid} aria-describedby="vehicle-help" disabled={busy}/><p id="vehicle-help" className={`mt-2 text-xs ${vehicleValid ? "text-stone-500" : "text-red-700"}`}>{vehicleValid ? "Have the number plate handy? Add it to your ride." : "Check the number, e.g. TS 09 AB 1234 or 22 BH 1234 AA."}</p></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div><button className="primary" disabled={!ready || !vehicleValid || busy || locating}>{busy ? "STARTING RIDE…" : "START RIDE"}</button><p className="mt-3 text-center text-xs text-stone-500">{ready ? "Your starting location will be saved with this session." : "Add your location and destination to get started."}</p></div></form>
      <aside className="space-y-5"><section className="card" aria-live="polite"><div className="mb-5 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">Before you go</h2><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Demo estimate</span></div>{ready ? <><dl className="grid grid-cols-2 gap-5"><div><dt className="text-sm text-stone-500">Expected distance</dt><dd className="mt-2 text-2xl font-bold">9.2 <span className="text-base font-normal">km</span></dd></div><div><dt className="text-sm text-stone-500">Expected duration</dt><dd className="mt-2 text-2xl font-bold">28–35 <span className="text-base font-normal">min</span></dd></div><div className="col-span-2 rounded-2xl bg-teal-50 p-4"><dt className="text-sm text-teal-800">Estimated local auto fare</dt><dd className="mt-1 text-3xl font-bold">₹180–₹220</dd></div></dl><p className="mt-4 text-xs leading-5 text-stone-500">Demo data only. These fixed examples are not calculated for your route and are not a fare quote.</p></> : <div className="rounded-2xl border border-dashed border-stone-300 px-5 py-9 text-center"><p className="text-3xl text-teal-700" aria-hidden="true">↗</p><p className="mt-3 font-semibold">A little clarity before you leave</p><p className="mt-2 text-sm leading-6 text-stone-500">Add your starting location and destination to see a demo ride estimate.</p></div>}</section><div className="px-3"><h2 className="text-sm font-bold">For the rides outside an app</h2><p className="mt-2 text-sm leading-6 text-stone-600">No booking required. Just a place to keep your ride details together.</p><p className="mt-4 text-xs leading-5 text-stone-500">This preview saves a ride session. Route checks, trusted contacts and safety alerts are coming later.</p></div></aside></div></main>;
}
