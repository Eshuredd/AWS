import { test, expect, type Page } from "@playwright/test";
import { mockApp, startRide } from "./fixtures";

async function review(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Use my location" }).click();
  await page.getByRole("combobox").fill("Station");
  await page.getByRole("option").click();
}

async function addContact(page: Page, name = "Alice", phone = "+91 98765 43210") {
  await page.locator("summary").filter({ hasText: "Trusted contacts" }).click();
  await page.getByRole("button", { name: "Add trusted contact" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Save contact" }).click();
}

test("trusted contacts add, edit, remove, and survive reload", async ({ page }) => {
  await mockApp(page); await review(page); await addContact(page);
  await expect(page.getByText("Trusted contacts are stored only on this device.")).toBeVisible();
  await expect(page.getByText("+919876543210")).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("ridewatch.trusted-contacts.v1"))).toContain("Alice");
  await review(page);
  await page.locator("summary").filter({ hasText: "Trusted contacts" }).click();
  await page.getByRole("listitem").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Asha");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Asha")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Add trusted contact" })).toBeVisible();
});

test("SOS dialog supports 112, web share, contact links, copying, and revocation", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ridewatch.trusted-contacts.v1", JSON.stringify({ version: 1, contacts: [{ id: "alice", name: "Alice", phone: "+919876543210" }] }));
    Object.assign(window, { shareCalls: [] as ShareData[], copied: "" });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { (window as unknown as { shareCalls: ShareData[] }).shareCalls.push(data); } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
  });
  await mockApp(page); await page.setViewportSize({ width: 390, height: 844 }); await startRide(page);
  const trigger = page.getByRole("button", { name: "Get help / SOS" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Emergency assistance" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
  await dialog.getByRole("button", { name: "Share live trip" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shareCalls: ShareData[] }).shareCalls[0]?.url)).toContain("/share/secret-token");
  const sms = dialog.getByRole("link", { name: "SMS" });
  const whatsapp = dialog.getByRole("link", { name: "WhatsApp" });
  expect(decodeURIComponent((await sms.getAttribute("href"))!)).toContain("sms:+919876543210?body=I may need help");
  expect(decodeURIComponent((await whatsapp.getAttribute("href"))!)).toContain("Live trip:\nhttp://localhost:3100/share/secret-token");
  await dialog.getByRole("button", { name: "Copy emergency details" }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toContain("Please check my live trip status.");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("Live trip sharing")).toBeVisible();
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.getByText("Live trip sharing")).toHaveCount(0);
});

test("clipboard fallback and unusual-state actions do not alter monitoring truth", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => localStorage.setItem("copied", text) } });
  });
  await mockApp(page); await startRide(page);
  await page.route("**/locations", handler => handler.fulfill({ json: { ride_id: "ride-1", gps_status: "GOOD", route_status: "ON_ROUTE", stop_status: "PROLONGED_STOP", delay_status: "ON_TIME", last_updated_at: new Date().toISOString(), distance_from_route_m: 10 } }));
  await page.evaluate(() => (window as unknown as { gpsTest: { emit: (accuracy: number) => void } }).gpsTest.emit(10));
  await expect(page.getByText("Something looks unusual.")).toBeVisible();
  await page.getByRole("button", { name: "I'm okay" }).click();
  await expect(page.getByText("Something looks unusual.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Longer stop detected" })).toBeVisible();
  await page.getByRole("button", { name: "Get help / SOS" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Share live trip" }).click();
  await expect(page.getByText("Emergency details copied.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("copied"))).toContain("/share/secret-token");
});

test("shared page polls only the read-only API and never requests viewer GPS", async ({ page }) => {
  let reads = 0; const mutations: string[] = [];
  await page.addInitScript(() => {
    Object.assign(window, { viewerGpsCalls: 0 });
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition() { (window as unknown as { viewerGpsCalls: number }).viewerGpsCalls++; },
      watchPosition() { (window as unknown as { viewerGpsCalls: number }).viewerGpsCalls++; return 1; }, clearWatch() {},
    } });
  });
  await page.route("**/api/**", async handler => {
    const request = handler.request(); const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") mutations.push(`${request.method()} ${path}`);
    if (path === "/api/share/public-token") {
      reads++;
      await handler.fulfill({ json: { ride_status: "ACTIVE", destination: "Station", vehicle_number: null,
        started_at: new Date().toISOString(), ended_at: null, expected_distance_km: 9.2, expected_duration_minutes: 31,
        gps_status: "GOOD", route_status: "ON_ROUTE", stop_status: "MOVING", delay_status: "ON_TIME", last_updated_at: new Date().toISOString(),
        current_location: { latitude: 17.44, longitude: 78.5, accuracy_m: 24, updated_at: new Date().toISOString() } } });
    } else await handler.fulfill({ status: 404, json: {} });
  });
  await page.goto("/share/public-token");
  await expect(page.getByRole("heading", { name: "Shared live trip" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open current location in Maps" })).toBeVisible();
  await expect(page.getByRole("button", { name: "End ride" })).toHaveCount(0);
  await page.waitForTimeout(9500);
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(mutations).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { viewerGpsCalls: number }).viewerGpsCalls)).toBe(0);
});
