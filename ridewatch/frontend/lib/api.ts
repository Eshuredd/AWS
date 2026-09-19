export type Ride = {
  id: string; start_lat: number; start_lng: number; destination: string;
  destination_lat: number | null; destination_lng: number | null;
  expected_distance_km: number | null; expected_duration_minutes: number | null;
  vehicle_number: string | null; status: "ACTIVE" | "COMPLETED";
  started_at: string; ended_at: string | null;
  fare_estimate: FareEstimate | null;
  expected_route: RouteEstimate | null;
};
export type CreateRide = Pick<Ride, "start_lat" | "start_lng" | "destination" | "vehicle_number"> & { destination_lat: number; destination_lng: number; expected_distance_km: number; expected_duration_minutes: number; fare_estimate_id?: string; route_estimate_id?: string };
const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", ...init?.headers } }); }
  catch { throw new Error("Could not reach RideWatch. Check your connection and that the backend is running, then try again."); }
  if (!response.ok) {
    if (response.status === 404) throw new Error("This ride could not be found. Local sessions disappear when the backend restarts.");
    if (response.status === 503) {
      const body = await response.json();
      const allowed = ["Destination search is temporarily unavailable", "Unable to calculate this route"];
      throw new Error(allowed.includes(body.detail) ? body.detail : "Location service is temporarily unavailable");
    }
    if (response.status === 409) {
      const body = await response.json();
      throw new Error(typeof body.detail === "string" ? body.detail : "This action conflicts with the ride’s current state.");
    }
    if (response.status === 422) throw new Error(path.endsWith("/fare-report")
      ? "Enter a fare greater than ₹0 and at most ₹10,000."
      : "Please check your destination, location and vehicle number, then try again.");
    throw new Error("Something went wrong. Please try again.");
  }
  return response.json() as Promise<T>;
}
export const createRide = (data: CreateRide) => request<Ride>("/api/rides", { method: "POST", body: JSON.stringify(data) });
export const getRide = (id: string, signal?: AbortSignal) => request<Ride>(`/api/rides/${encodeURIComponent(id)}`, { signal });
export const endRide = (id: string, drop: DropLocation) => request<Ride>(`/api/rides/${encodeURIComponent(id)}/end`, { method: "PATCH", body: JSON.stringify(drop) });
export const normalizeVehicle = (value: string) => value.toUpperCase().replace(/\s+/g, "");
export const validVehicle = (value: string) => !value || /^(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}|[0-9]{2}BH[0-9]{1,4}[A-Z]{1,2})$/.test(value);

export type Coordinates = { latitude: number; longitude: number };
export type Place = Coordinates & { id: string | null; label: string };
export type RouteEstimate = { distance_km: number; duration_minutes: number; duration_seconds: number; route_estimate_id: string; calculated_at: string; expires_at: string; traffic_aware: boolean; route_geometry: Coordinates[] };
export function searchPlaces(query: string, location: Coordinates | null, signal: AbortSignal) {
  const params = new URLSearchParams({ q: query });
  if (location) { params.set("lat", String(location.latitude)); params.set("lng", String(location.longitude)); }
  return request<{ results: Place[] }>(`/api/places/search?${params}`, { signal });
}
export function calculateRoute(start: Coordinates, destination: Coordinates, signal: AbortSignal) {
  return request<RouteEstimate>("/api/route-estimate", { method: "POST", signal, body: JSON.stringify({
    start_lat: start.latitude, start_lng: start.longitude,
    destination_lat: destination.latitude, destination_lng: destination.longitude,
  }) });
}
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const remainder = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${remainder ? ` ${remainder} min` : ""}`;
}
export function formatDistance(km: number) {
  return km < 0.1 ? "<0.1" : km.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export type FareEstimate = {
  estimate_id: string; currency: "INR"; supported: boolean;
  official_meter: { minimum: number; maximum: number; source: string; effective_from: string; night_applied: boolean } | null;
  typical_reported: { minimum: number; maximum: number; median: number; sample_count: number; pickup_radius_m: number; destination_radius_m: number; confidence: "LOW" | "MEDIUM" | "HIGH"; source: string } | null;
};
export type DropLocation = { drop_location_source: "DESTINATION_FALLBACK" } | { drop_location_source: "GPS"; drop_lat: number; drop_lng: number };
export function estimateFare(start: Coordinates, destination: Coordinates, route: RouteEstimate, signal: AbortSignal) {
  return request<FareEstimate>("/api/fare-estimate", { method: "POST", signal, body: JSON.stringify({ distance_km: route.distance_km, duration_minutes: route.duration_minutes,
    start_lat: start.latitude, start_lng: start.longitude, destination_lat: destination.latitude, destination_lng: destination.longitude,
  }) });
}
export type Monitoring = {
  ride_id: string; gps_status: "WAITING" | "GOOD" | "POOR" | "STALE" | "UNAVAILABLE";
  route_status: "UNKNOWN" | "ON_ROUTE" | "POSSIBLE_DEVIATION" | "DEVIATED";
  stop_status: "UNKNOWN" | "MOVING" | "PROLONGED_STOP";
  delay_status: "UNKNOWN" | "ON_TIME" | "DELAYED";
  distance_from_route_m: number | null; last_updated_at: string | null;
};
export const sendLocation = (id: string, data: Coordinates & { accuracy_m: number }, signal: AbortSignal) => request<Monitoring>(`/api/rides/${encodeURIComponent(id)}/locations`, { method: "POST", body: JSON.stringify(data), signal });
export const getMonitoring = (id: string, signal: AbortSignal) => request<Monitoring>(`/api/rides/${encodeURIComponent(id)}/monitoring`, { signal });
export const reportFare = (id: string, fare_paid: number) => request<{ ride_id: string; fare_paid: number; reported_at: string }>(`/api/rides/${encodeURIComponent(id)}/fare-report`, { method: "POST", body: JSON.stringify({ fare_paid }) });
export function captureDropLocation(): Promise<DropLocation> {
  return new Promise(resolve => {
    const fallback: DropLocation = { drop_location_source: "DESTINATION_FALLBACK" };
    // Independent deadline also covers browsers that leave permission prompts pending.
    const deadline = window.setTimeout(() => resolve(fallback), 8000);
    const finish = (drop: DropLocation) => { window.clearTimeout(deadline); resolve(drop); };
    if (!navigator.geolocation) { finish(fallback); return; }
    try {
      navigator.geolocation.getCurrentPosition(({ coords }) => finish({ drop_location_source: "GPS", drop_lat: coords.latitude, drop_lng: coords.longitude }), () => finish(fallback), { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 });
    } catch { finish(fallback); }
  });
}
