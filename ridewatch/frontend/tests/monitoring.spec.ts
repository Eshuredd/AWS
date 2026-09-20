import { test, expect } from "@playwright/test";
import { mockApp, startRide } from "./fixtures";
import { startTracking } from "../lib/live-tracking";
import type { Monitoring } from "../lib/api";

test("watcher throttles, handles failures, and aborts on cleanup", async () => {
  let success!: PositionCallback;
  let failure!: PositionErrorCallback;
  let cleared = false;
  let time = 0;
  let sent = 0;
  let signal: AbortSignal | undefined;
  const errors: string[] = [];
  const geolocation = {
    watchPosition(onSuccess: PositionCallback, onError: PositionErrorCallback, options: PositionOptions) {
      success = onSuccess; failure = onError;
      expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
      return 42;
    }, clearWatch(id: number) { expect(id).toBe(42); cleared = true; },
  } as Geolocation;
  const stop = startTracking({ geolocation, now: () => time, onState: () => {}, onError: value => errors.push(value),
    send: async (sample, nextSignal) => { expect(sample).toEqual({ latitude: 17, longitude: 78, accuracy_m: 10 }); sent++; signal = nextSignal; throw new Error("offline"); } });
  const position = { coords: { latitude: 17, longitude: 78, accuracy: 10 } } as GeolocationPosition;
  await success(position);
  await success(position);
  expect(sent).toBe(1);
  time = 5000;
  await success(position);
  expect(sent).toBe(2);
  failure({ code: 1 } as GeolocationPositionError);
  expect(errors.at(-1)).toContain("Permission denied");
  failure({ code: 3 } as GeolocationPositionError);
  expect(errors.at(-1)).toContain("timed out");
  stop();
  expect(cleared).toBe(true);
  expect(signal?.aborted).toBe(true);
  time = 10000;
  await success(position);
  expect(sent).toBe(2);
});

test("watcher ignores late responses and handles missing browser support", async () => {
  let success!: PositionCallback;
  let resolve!: (value: Monitoring) => void;
  let states = 0;
  const stop = startTracking({ geolocation: { watchPosition(callback: PositionCallback) { success = callback; return 1; }, clearWatch() {}, getCurrentPosition() {} },
    send: () => new Promise<Monitoring>(done => { resolve = done; }), onState: () => { states++; }, onError: () => {} });
  const pending = success({ coords: { latitude: 17, longitude: 78, accuracy: 10 } } as GeolocationPosition);
  stop(); resolve({} as Monitoring); await pending;
  expect(states).toBe(0);
  let error = "";
  startTracking({ send: async () => ({} as Monitoring), onState: () => {}, onError: value => { error = value; } });
  expect(error).toContain("no geolocation support");
});

test("destination search waits for current location and sends both coordinates", async ({ page }) => {
  await mockApp(page);
  const searches: URL[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/places/search") searches.push(new URL(request.url()));
  });
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByLabel("Where are you going?")).toBeDisabled();
  await page.clock.fastForward(2000);
  expect(searches).toHaveLength(0);
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.getByLabel("Where are you going?").fill("Station");
  await page.clock.fastForward(1000);
  await expect(page.getByRole("option", { name: "Secunderabad Railway Station" })).toBeVisible();
  expect(searches).toHaveLength(1);
  expect(searches[0].searchParams.get("lat")).toBe("17.44");
  expect(searches[0].searchParams.get("lng")).toBe("78.49");
  expect(searches[0].pathname).toBe("/api/places/search");
});

test("initial pickup timeout keeps search disabled and offers a retry", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition(_success: PositionCallback, failure: PositionErrorCallback, options: PositionOptions) {
        Object.assign(window, { pickupOptions: options });
        failure({ code: 3 } as GeolocationPositionError);
      },
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText("Finding your location took too long. Please try again.")).toBeVisible();
  await expect(page.getByLabel("Where are you going?")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Use my location" })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { pickupOptions: PositionOptions }).pickupOptions)).toEqual({ enableHighAccuracy: false, timeout: 25000, maximumAge: 60000 });
});

test("destination, expired quote refresh, monitoring, completion and fare report", async ({ page }) => {
  const calls = await mockApp(page, true);
  await startRide(page);
  expect(calls.routes()).toBe(2);
  await page.evaluate(() => (window as unknown as { gpsTest: { emit: (accuracy: number) => void } }).gpsTest.emit(10));
  await expect(page.getByText("On expected route", { exact: true })).toBeVisible();
  expect(calls.updates()).toBe(1);
  await page.getByRole("button", { name: "End ride", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End ride", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ride completed" })).toBeVisible();
  const gps = await page.evaluate(() => (window as unknown as { gpsTest: { starts: number; clears: number } }).gpsTest);
  expect(gps.clears).toBe(gps.starts);
  await page.getByLabel("Total fare paid").fill("120");
  await page.getByRole("button", { name: "Submit fare", exact: true }).click();
  await expect(page.getByText(/Your fare report will help/)).toBeVisible();
});

test("poor signal and permission failure keep ride active; retry and unmount clean up", async ({ page }) => {
  await mockApp(page);
  await startRide(page);
  await page.evaluate(() => (window as unknown as { gpsTest: { emit: (accuracy: number) => void } }).gpsTest.emit(200));
  await expect(page.getByRole("heading", { name: "Location signal is weak" })).toBeVisible();
  await page.evaluate(() => (window as unknown as { gpsTest: { fail: (code: number) => void } }).gpsTest.fail(1));
  await expect(page.getByText(/Permission denied/)).toBeVisible();
  await expect(page.getByText("Ride in progress", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart monitoring" }).click();
  await page.getByRole("button", { name: "Leave session", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use my location" })).toBeVisible();
  const gps = await page.evaluate(() => (window as unknown as { gpsTest: { starts: number; clears: number } }).gpsTest);
  expect(gps.clears).toBe(gps.starts);
});
