"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createRide, normalizeVehicle, validVehicle, type Place } from "@/lib/api";
import DestinationSearch from "@/components/destination-search";
import RouteEstimateCard from "@/components/route-estimate-card";
import { useRouteEstimate } from "@/lib/use-route-estimate";
export default function Home() {
  const router = useRouter();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const route = useRouteEstimate(location, destination);
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const ready = !!location && !!destination && !!route.estimate;
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
    if (!location || !destination || !route.estimate || !ready || !vehicleValid || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try { const ride = await createRide({ start_lat: location.latitude, start_lng: location.longitude, destination: destination.label, destination_lat: destination.latitude, destination_lng: destination.longitude, expected_distance_km: route.estimate.distance_km, expected_duration_minutes: route.estimate.duration_minutes, vehicle_number: normalizeVehicle(vehicle) || null }); router.push(`/ride/${ride.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to start ride."); submitting.current = false; setBusy(false); }
  }
  return <main><div className="mb-8"><p className="mb-3 text-xs font-bold tracking-[.18em] text-teal-700">YOUR RIDE. A LITTLE MORE REASSURANCE.</p><h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Know your ride<br className="hidden sm:block"/> before you get in.</h1><p className="mt-4 max-w-lg leading-7 text-stone-600">Street-hailed auto or a local cab. Start with the details, wherever you book your ride.</p></div>
    <div className="grid gap-6 md:grid-cols-[1.15fr_1fr]"><form onSubmit={start} className="card space-y-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Let’s get you ready</h2><span className="text-xs text-stone-500">01 / RIDE DETAILS</span></div>
      <div><h3 className="mb-3 text-sm font-bold">Current location</h3><div className="rounded-2xl bg-stone-50 p-4"><p className="mb-3 text-sm text-stone-600" role="status">{locating ? "Finding your location…" : location ? "Current location detected" : "Add your starting point with one tap."}</p><button type="button" onClick={locate} disabled={locating || busy} className="secondary w-full">{locating ? "Finding location…" : location ? "Refresh my location" : "Use my location"}</button></div>{locationError && <p role="alert" className="mt-2 text-sm text-red-700">{locationError}</p>}</div>
      <DestinationSearch location={location} selected={destination} onSelect={setDestination} disabled={busy}/>
      <div><label htmlFor="vehicle" className="mb-2 block text-sm font-bold">Vehicle number <span className="font-normal text-stone-500">(optional)</span></label><input id="vehicle" placeholder="TS 09 AB 1234" value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} onBlur={() => setVehicle(normalizeVehicle(vehicle))} maxLength={30} aria-invalid={!vehicleValid} aria-describedby="vehicle-help" disabled={busy}/><p id="vehicle-help" className={`mt-2 text-xs ${vehicleValid ? "text-stone-500" : "text-red-700"}`}>{vehicleValid ? "Have the number plate handy? Add it to your ride." : "Check the number, e.g. TS 09 AB 1234 or 22 BH 1234 AA."}</p></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div><button className="primary" disabled={!ready || !vehicleValid || busy || locating}>{busy ? "STARTING RIDE…" : "START RIDE"}</button><p className="mt-3 text-center text-xs text-stone-500">{ready ? "Your starting location will be saved with this session." : "Select a destination and get a route estimate to start."}</p></div></form>
      <aside className="space-y-5"><RouteEstimateCard estimate={route.estimate} loading={route.loading} error={route.error} retry={route.retry}/><div className="px-3"><h2 className="text-sm font-bold">For the rides outside an app</h2><p className="mt-2 text-sm leading-6 text-stone-600">No booking required. Just a place to keep your ride details together.</p><p className="mt-4 text-xs leading-5 text-stone-500">This preview saves a ride session. Route checks, trusted contacts and safety alerts are coming later.</p></div></aside></div></main>;
}
