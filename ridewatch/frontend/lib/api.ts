export type Ride = {
  id: string; start_lat: number; start_lng: number; destination: string;
  vehicle_number: string | null; status: "ACTIVE" | "COMPLETED";
  started_at: string; ended_at: string | null;
};
export type CreateRide = Pick<Ride, "start_lat" | "start_lng" | "destination" | "vehicle_number">;
const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${base}${path}`, { ...init, cache: "no-store", signal: init?.signal ?? AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", ...init?.headers } }); }
  catch { throw new Error("Could not reach RideWatch. Check your connection and that the backend is running, then try again."); }
  if (!response.ok) {
    if (response.status === 404) throw new Error("This ride could not be found. Local sessions disappear when the backend restarts.");
    if (response.status === 422) throw new Error("Please check your destination and vehicle number, then try again.");
    throw new Error("Something went wrong. Please try again.");
  }
  return response.json() as Promise<T>;
}
export const createRide = (data: CreateRide) => request<Ride>("/api/rides", { method: "POST", body: JSON.stringify(data) });
export const getRide = (id: string, signal?: AbortSignal) => request<Ride>(`/api/rides/${encodeURIComponent(id)}`, { signal });
export const endRide = (id: string) => request<Ride>(`/api/rides/${encodeURIComponent(id)}/end`, { method: "PATCH" });
export const normalizeVehicle = (value: string) => value.toUpperCase().replace(/\s+/g, "");
export const validVehicle = (value: string) => !value || /^(?:[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}|[0-9]{2}BH[0-9]{1,4}[A-Z]{1,2})$/.test(value);
