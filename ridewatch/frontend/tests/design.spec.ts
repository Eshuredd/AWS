import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { mockApp, startRide } from "./fixtures";
import { monitoringPresentation } from "../lib/monitoring-presentation";
import type { Monitoring } from "../lib/api";
const emit = (page: Page, accuracy = 10) => page.evaluate(a => (window as unknown as { gpsTest: { emit: (a: number) => void } }).gpsTest.emit(a), accuracy);
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, caret: "initial", animations: "disabled" });
  await page.screenshot({ path: info.outputPath(`${name}-viewport.png`), caret: "initial", animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function review(page: Page) {
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.getByRole("combobox").fill("Station");
  await expect(page.getByRole("option")).toBeVisible();
  await page.getByRole("combobox").press("ArrowDown");
  await page.getByRole("combobox").press("Enter");
  await expect(page.getByRole("button", { name: "Start ride", exact: true })).toBeEnabled();
}
for (const [width, height] of [[390,844],[430,932],[768,1024],[1440,900]]) {
  test(`journey visual QA ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await mockApp(page);
    await page.goto("/");
    await shot(page, info, "01-pickup");
    await review(page);
    await shot(page, info, "02-route-review");
    const start = await page.getByRole("button", { name: "Start ride", exact: true }).boundingBox();
    expect(start!.y + start!.height).toBeLessThanOrEqual(height);
    await page.locator("summary").filter({ hasText: "Add vehicle number" }).click();
    await page.getByLabel("Vehicle number", { exact: true }).fill("TS 09 AB 1234");
    await page.getByLabel("Vehicle number", { exact: true }).blur();
    await expect(page.getByText("Number ready")).toBeVisible();
    await shot(page, info, "03-vehicle");
    await page.getByRole("button", { name: "Start ride", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Waiting for a reliable location" })).toBeVisible();
    await shot(page, info, "04-waiting");
    await emit(page);
    await expect(page.getByRole("heading", { name: "On expected route" })).toBeVisible();
    await shot(page, info, "05-active");
    const end = await page.getByRole("button", { name: "End ride", exact: true }).boundingBox();
    expect(end!.y + end!.height).toBeLessThanOrEqual(height);
    // Restart clears the throttle and keeps a single watcher alive.
    await page.evaluate(() => (window as unknown as { gpsTest: { fail: (n: number) => void } }).gpsTest.fail(1));
    await page.getByRole("button", { name: "Restart monitoring" }).click();
    await emit(page, 200);
    await expect(page.getByRole("heading", { name: "Location signal is weak" })).toBeVisible();
    await shot(page, info, "06-poor-signal");
    await page.getByRole("button", { name: "End ride", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keep riding" })).toBeFocused();
    await shot(page, info, "07-end-confirmation");
    await page.getByRole("dialog").getByRole("button", { name: "End ride", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ride completed" })).toBeVisible();
    await shot(page, info, "08-completed");
    await page.getByLabel("Total fare paid").fill("120");
    await page.getByRole("button", { name: "Submit fare" }).click();
    await expect(page.getByRole("heading", { name: "Thanks for sharing." })).toBeVisible();
    await shot(page, info, "09-fare-sent");
  });
}

test("status priority never reassures on stale, weak or unknown readings", () => {
  const now = Date.now();
  const good: Monitoring = { ride_id: "test", gps_status: "GOOD", route_status: "ON_ROUTE", stop_status: "MOVING", delay_status: "ON_TIME", last_updated_at: new Date(now).toISOString(), distance_from_route_m: 10 };
  expect(monitoringPresentation(good, "", now).tone).toBe("good");
  expect(monitoringPresentation(good, "", now + 31000).headline).toBe("Monitoring unavailable");
  expect(monitoringPresentation({ ...good, gps_status: "POOR" }, "", now).reliable).toBe(false);
  expect(monitoringPresentation({ ...good, last_updated_at: null }, "", now).tone).toBe("neutral");
  expect(monitoringPresentation({ ...good, route_status: "DEVIATED", stop_status: "PROLONGED_STOP", delay_status: "DELAYED" }, "", now)).toMatchObject({ tone: "danger", movement: "Prolonged stop detected", timing: "Significant delay detected" });
  expect(monitoringPresentation(good, "Permission denied", now).tone).toBe("caution");
  expect(monitoringPresentation({ ...good, route_status: "POSSIBLE_DEVIATION" }, "", now).tone).toBe("caution");
});

test("confirmation preserves monitoring; failed ending is recoverable; leave is deliberate", async ({ page }) => {
  await mockApp(page); await startRide(page);
  const initialClears = await page.evaluate(() => (window as unknown as { gpsTest: { clears: number } }).gpsTest.clears);
  await page.getByRole("button", { name: "End ride", exact: true }).click();
  const before = await page.evaluate(() => (window as unknown as { gpsTest: { clears: number } }).gpsTest.clears);
  expect(before).toBe(initialClears);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "End ride", exact: true })).toBeFocused();
  await page.route("**/end", handler => handler.fulfill({ status: 503, json: { detail: "storage unavailable" } }));
  await page.getByRole("button", { name: "End ride", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End ride", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Your ride is still active");
  await expect(page.getByRole("region", { name: "Live monitoring" })).toBeVisible();
  await page.getByRole("button", { name: "Leave session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep ride open" })).toBeFocused();
  await page.getByRole("button", { name: "Keep ride open" }).click();
  await expect(page.getByRole("region", { name: "Live monitoring" })).toBeVisible();
});

for (const [width, height] of [[390,844],[430,932],[1440,900]]) {
test(`search cancellation, empty results, retry and vehicle validation ${width}x${height}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await mockApp(page); await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.route("**/places/search?**", h => h.fulfill({ json: { results: [] } }));
  await page.getByRole("combobox").fill("Unknown");
  await expect(page.getByText(/No destinations found/)).toBeVisible();
  await shot(page, info, "search-empty");
  await page.unroute("**/places/search?**");
  await page.getByRole("combobox").fill("Station");
  await expect(page.getByRole("option")).toBeVisible();
  await shot(page, info, "search-results");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await page.locator("summary").filter({ hasText: "Add vehicle number" }).click();
  await page.getByLabel("Vehicle number", { exact:true }).fill("WRONG");
  await expect(page.getByRole("button", { name:"Start ride", exact:true })).toBeDisabled();
  await shot(page, info, "vehicle-error");
  await page.getByLabel("Vehicle number", { exact:true }).fill("");
  await expect(page.getByRole("button", { name:"Start ride", exact:true })).toBeEnabled();
});

}

for (const [width, height] of [[390,844],[430,932],[1440,900]]) {
test(`pending, warning and completion states ${width}x${height}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height });
  await mockApp(page);
  let releaseRoute!: () => void;
  const routeGate = new Promise<void>(done => { releaseRoute = done; });
  let releaseFare!: () => void;
  const fareGate = new Promise<void>(done => { releaseFare = done; });
  await page.route("**/route-estimate", async h => { await routeGate; await h.fallback(); });
  await page.route("**/fare-estimate", async h => { await fareGate; await h.fallback(); });
  await page.goto("/");
  await page.getByRole("button", { name:"Use my location" }).click();
  await page.getByRole("combobox").fill("Station");
  await page.getByRole("option").click();
  await expect(page.getByText("Calculating your road route…")).toBeVisible();
  await shot(page, info, "route-loading"); releaseRoute();
  await expect(page.getByText("Calculating fare estimate…")).toBeVisible();
  await shot(page, info, "fare-loading"); releaseFare();
  await expect(page.getByRole("button", { name:"Start ride", exact:true })).toBeEnabled();
  let releaseStart!: () => void;
  const startGate = new Promise<void>(done => { releaseStart = done; });
  await page.route("**/api/rides", async h => { await startGate; await h.fallback(); });
  await page.getByRole("button", { name:"Start ride", exact:true }).click();
  await expect(page.getByRole("button", { name:"Starting ride…" })).toBeDisabled();
  await shot(page, info, "starting"); releaseStart();
  await expect(page.getByRole("region", { name:"Live monitoring" })).toBeVisible();
  await page.evaluate(() => (window as unknown as { gpsTest: { fail: (n: number) => void } }).gpsTest.fail(1));
  await expect(page.getByRole("heading", { name:"Monitoring unavailable" })).toBeVisible();
  await shot(page, info, "permission-denied");
  await page.getByRole("button", { name:"Leave session", exact:true }).click();
  await shot(page, info, "leave-confirmation");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("dialog").getByRole("button", { name:"Leave session", exact:true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name:"Keep ride open" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name:"Restart monitoring" }).click();
  await page.route("**/locations", h => h.fulfill({ json: { ride_id:"ride-1", gps_status:"GOOD", route_status:"DEVIATED", stop_status:"PROLONGED_STOP", delay_status:"DELAYED", last_updated_at:new Date().toISOString(), distance_from_route_m:300 } }));
  await emit(page);
  await expect(page.getByRole("heading", { name:"Away from expected route" })).toBeVisible();
  await expect(page.getByText("Prolonged stop detected", { exact:true })).toBeVisible();
  await expect(page.getByRole("button", { name:"Get help", exact:true })).toBeVisible();
  await shot(page, info, "deviation-and-delay");
  let releaseEnd!: () => void;
  const endGate = new Promise<void>(done => { releaseEnd = done; });
  await page.route("**/end", async h => { await endGate; await h.fallback(); });
  await page.getByRole("button", { name:"End ride", exact:true }).click();
  await page.getByRole("dialog").getByRole("button", { name:"End ride", exact:true }).click();
  await expect(page.getByRole("heading", { name:"Ending your ride" })).toBeVisible();
  await shot(page, info, "ending"); releaseEnd();
  await expect(page.getByRole("heading", { name:"Ride completed" })).toBeVisible();
  await page.getByRole("button", { name:"Skip", exact:true }).click();
  await expect(page.getByRole("link", { name:"Start another ride" })).toBeVisible();
  await shot(page, info, "fare-skipped");
});

}

test("unsupported fares, service errors and narrow reflow", async ({ page }, info) => {
  await page.setViewportSize({ width:360, height:800 });
  await page.emulateMedia({ reducedMotion:"reduce" });
  await mockApp(page);
  await page.route("**/route-estimate", h => h.fulfill({ status:503, json:{detail:"Unable to calculate this route"} }));
  await page.goto("/");
  await page.getByRole("button", { name:"Use my location" }).click();
  await page.getByRole("combobox").fill("Station");
  await page.getByRole("option").click();
  await expect(page.locator(".notice")).toContainText("Unable to calculate this route");
  await shot(page, info, "route-error");
  await page.unroute("**/route-estimate");
  await page.route("**/fare-estimate", h => h.fulfill({ json:{estimate_id:"fare-1", supported:false, currency:"INR", official_meter:null, typical_reported:null} }));
  await page.getByRole("button", { name:"Retry estimate" }).click();
  await expect(page.getByText("Outside supported area")).toBeVisible();
  await expect(page.getByRole("button", { name:"Start ride", exact:true })).toBeEnabled();
  await shot(page, info, "unsupported-fare-360");
  expect(await page.locator(".enter").first().evaluate(e => getComputedStyle(e).animationName)).toBe("none");
  await page.setViewportSize({ width:320, height:640 }); await shot(page, info, "reflow-320");
  // Desktop browser zoom to 200% halves the available CSS viewport.
  await page.setViewportSize({ width:384, height:512 }); await shot(page, info, "zoom-200-reflow");
});
