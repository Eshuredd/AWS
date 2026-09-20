import { expect, type Page } from "@playwright/test";
export async function mockApp(page: Page, expired = false) {
  await page.addInitScript(() => {
    const control: { starts: number; clears: number; initialOptions?: PositionOptions; emit: (accuracy: number) => void; fail: (code: number) => void } = { starts: 0, clears: 0, emit: () => {}, fail: () => {} };
    Object.assign(window, { gpsTest: control });
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition(success: PositionCallback, _failure: PositionErrorCallback, options: PositionOptions) { control.initialOptions = options; success({ coords: { latitude: 17.44, longitude: 78.49, accuracy: 10 } } as GeolocationPosition); },
      watchPosition(success: PositionCallback, failure: PositionErrorCallback) {
        control.starts++;
        control.emit = (accuracy: number) => success({ coords: { latitude: 17.44, longitude: 78.50, accuracy } } as GeolocationPosition);
        control.fail = (code: number) => failure({ code } as GeolocationPositionError);
        return control.starts;
      }, clearWatch() { control.clears++; },
    } });
  });
  let routes = 0;
  let updates = 0;
  let ride: Record<string, unknown> = {};
  let shareRevoked = false;
  const fare = { estimate_id: "fare-1", supported: true, currency: "INR", official_meter: { minimum: 104, maximum: 104, source: "Telangana", effective_from: "2014-02-14", night_applied: false }, typical_reported: null };
  let routeQuote: Record<string, unknown>;
  await page.route("**/api/**", async handler => {
    const request = handler.request();
    const path = new URL(request.url()).pathname;
    let body: unknown;
    if (path === "/api/places/search") body = { results: [{ id: "place", label: "Secunderabad Railway Station", latitude: 17.44, longitude: 78.51 }] };
    else if (path === "/api/route-estimate") {
      routes++;
      routeQuote = { route_estimate_id: `route-${routes}`, distance_km: 9.2, duration_minutes: 31, duration_seconds: 1801, traffic_aware: true, calculated_at: new Date().toISOString(), expires_at: new Date(Date.now() + (expired && routes === 1 ? -1 : 300000)).toISOString(), route_geometry: [{ latitude: 17.44, longitude: 78.49 }, { latitude: 17.445, longitude: 78.493 }, { latitude: 17.447, longitude: 78.493 }, { latitude: 17.447, longitude: 78.502 }, { latitude: 17.451, longitude: 78.507 }, { latitude: 17.449, longitude: 78.514 }, { latitude: 17.455, longitude: 78.518 }] };
      body = routeQuote;
    } else if (path === "/api/fare-estimate") body = fare;
    else if (path === "/api/rides") {
      expect(request.postDataJSON().route_estimate_id).toBe(`route-${routes}`);
      expect(request.postDataJSON().fare_estimate_id).toBe("fare-1");
      ride = { ...request.postDataJSON(), id: "ride-1", status: "ACTIVE", started_at: new Date().toISOString(), ended_at: null, expected_route: routeQuote, fare_estimate: fare };
      body = ride;
    } else if (path.endsWith("/share") && request.method() === "POST") {
      shareRevoked = false; body = { token: "secret-token", expires_at: new Date(Date.now() + 86400000).toISOString() };
    } else if (path === "/api/share/secret-token" && request.method() === "DELETE") {
      shareRevoked = true; await handler.fulfill({ status: 204, body: "" }); return;
    } else if (path === "/api/share/secret-token") {
      if (shareRevoked) { await handler.fulfill({ status: 404, json: { detail: "expired" } }); return; }
      body = { ride_status: ride.status || "ACTIVE", destination: ride.destination || "Secunderabad Railway Station", vehicle_number: ride.vehicle_number || null,
        started_at: ride.started_at || new Date().toISOString(), ended_at: ride.ended_at || null, expected_distance_km: 9.2, expected_duration_minutes: 31,
        gps_status: "GOOD", route_status: "ON_ROUTE", stop_status: "MOVING", delay_status: "ON_TIME", last_updated_at: new Date().toISOString(),
        current_location: { latitude: 17.44, longitude: 78.50, accuracy_m: 24, updated_at: new Date().toISOString() } };
    } else if (path.endsWith("/locations") || path.endsWith("/monitoring")) {
      if (path.endsWith("/locations")) updates++;
      const poor = path.endsWith("/locations") && request.postDataJSON().accuracy_m > 100;
      body = { ride_id: "ride-1", gps_status: poor ? "POOR" : "GOOD", route_status: poor ? "UNKNOWN" : "ON_ROUTE", stop_status: poor ? "UNKNOWN" : "MOVING", delay_status: "ON_TIME", distance_from_route_m: poor ? null : 10, last_updated_at: new Date().toISOString() };
    } else if (path.endsWith("/end")) {
      expect(request.postDataJSON().drop_location_source).toBe("GPS");
      ride = { ...ride, status: "COMPLETED", ended_at: new Date().toISOString() }; body = ride;
    } else if (path.endsWith("/fare-report")) body = { ride_id: "ride-1", fare_paid: 120, reported_at: new Date().toISOString() };
    else body = ride;
    await handler.fulfill({ json: body });
  });
  return { routes: () => routes, updates: () => updates };
}

export async function startRide(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Where are you going?")).toBeDisabled();
  await expect(page.getByText("Add your current location before searching for a destination.")).toBeVisible();
  await page.getByRole("button", { name: "Use my location" }).click();
  expect(await page.evaluate(() => (window as unknown as { gpsTest: { initialOptions: PositionOptions } }).gpsTest.initialOptions)).toEqual({ enableHighAccuracy: false, timeout: 25000, maximumAge: 60000 });
  await expect(page.getByLabel("Where are you going?")).toBeEnabled();
  await page.getByLabel("Where are you going?").fill("Station");
  await page.getByRole("option", { name: "Secunderabad Railway Station" }).click();
  await page.getByRole("button", { name: "Start ride", exact: true }).click();
  await expect(page.getByText("Ride in progress", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live monitoring" })).toBeVisible();
}

