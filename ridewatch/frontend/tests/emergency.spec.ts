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
  await expect(page.getByText(/Trusted contacts are stored in this browser on this device/)).toBeVisible();
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

test("SOS dialog confirms one broadcast, adopts its share, and keeps manual actions", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ridewatch.trusted-contacts.v1", JSON.stringify({ version: 1, contacts: [{ id: "alice", name: "Alice", phone: "+919876543210" }] }));
    Object.assign(window, { shareCalls: [] as ShareData[], copied: "" });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { (window as unknown as { shareCalls: ShareData[] }).shareCalls.push(data); } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
  });
  const app = await mockApp(page); await page.setViewportSize({ width: 390, height: 844 }); await startRide(page);
  const trigger = page.getByRole("button", { name: "Get help / SOS" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Emergency assistance" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
  await dialog.getByRole("button", { name: "SEND SOS" }).click();
  const confirmation = page.getByRole("dialog", { name: "Send emergency SOS?" });
  await expect(confirmation).toContainText("1 trusted contact");
  await confirmation.getByRole("button", { name: "Send SOS", exact: true }).click();
  await expect(dialog.getByText("SOS sent to all 1 trusted contact.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Need immediate help? Call 112" })).toBeVisible();
  expect(app.sosRequests).toHaveLength(1);
  expect(app.sosRequests[0]).toMatchObject({ phone_numbers: ["+919876543210"] });
  expect((app.sosRequests[0] as { request_id: string }).request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => localStorage.getItem("ridewatch.share.v1.ride-1"))).toBe("sos-secret-token");
  await dialog.getByRole("button", { name: "Share live trip" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shareCalls: ShareData[] }).shareCalls[0]?.url)).toContain("/share/sos-secret-token");
  const whatsapp = dialog.getByRole("link", { name: "Open WhatsApp" });
  expect(decodeURIComponent((await whatsapp.getAttribute("href"))!)).toContain("Live trip:\nhttp://localhost:3100/share/sos-secret-token");
  await dialog.getByRole("button", { name: "Copy emergency details" }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toContain("Please check my live trip status.");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByText("Live trip sharing")).toBeVisible();
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(page.getByText("Live trip sharing")).toHaveCount(0);
});

test("SOS confirmation can be cancelled without sending", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ridewatch.trusted-contacts.v1", JSON.stringify({ version: 1, contacts: [{ id: "alice", name: "Alice", phone: "+919876543210" }] })));
  const app = await mockApp(page); await startRide(page);
  await page.getByRole("button", { name: "Get help / SOS" }).click();
  await page.getByRole("dialog", { name: "Emergency assistance" }).getByRole("button", { name: "SEND SOS" }).click();
  await page.getByRole("dialog", { name: "Send emergency SOS?" }).getByRole("button", { name: "Cancel" }).click();
  expect(app.sosRequests).toHaveLength(0);
});

test("SOS provider errors are clear and keep independent emergency actions available", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ridewatch.trusted-contacts.v1", JSON.stringify({ version: 1, contacts: [{ id: "alice", name: "Alice", phone: "+919876543210" }] })));
  await mockApp(page); await startRide(page);
  await page.route("**/api/rides/*/sos", handler => handler.fulfill({ status: 503, json: { detail: "Automatic SOS messaging is not configured." } }));
  await page.getByRole("button", { name: "Get help / SOS" }).click();
  const dialog = page.getByRole("dialog", { name: "Emergency assistance" });
  await dialog.getByRole("button", { name: "SEND SOS" }).click();
  await page.getByRole("dialog", { name: "Send emergency SOS?" }).getByRole("button", { name: "Send SOS", exact: true }).click();
  await expect(dialog.getByText("Automatic SOS messaging is not configured.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Call 112" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Share live trip" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Copy emergency details" })).toBeEnabled();
});

test("SOS sends all contacts once, disables while sending, and reports partial delivery", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ridewatch.trusted-contacts.v1", JSON.stringify({ version: 1, contacts: [
    { id: "a", name: "Alice", phone: "+919876543210" },
    { id: "b", name: "Bob", phone: "+14155552671" },
    { id: "c", name: "Cara", phone: "+442071838750" },
  ] })));
  await mockApp(page); await page.setViewportSize({ width: 390, height: 844 }); await startRide(page);
  let posts = 0; let payload: { request_id: string; phone_numbers: string[] } | null = null;
  await page.route("**/api/rides/*/sos", async handler => {
    posts++; payload = handler.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 250));
    await handler.fulfill({ json: { token: "partial-token", expires_at: new Date(Date.now() + 86400000).toISOString(), requested: 3, sent: 2, failed: 1 } });
  });
  await page.getByRole("button", { name: "Get help / SOS" }).click();
  const dialog = page.getByRole("dialog", { name: "Emergency assistance" });
  await dialog.getByRole("button", { name: "SEND SOS" }).click();
  const confirmation = page.getByRole("dialog", { name: "Send emergency SOS?" });
  await expect(confirmation).toContainText("3 trusted contacts");
  await confirmation.getByRole("button", { name: "Send SOS", exact: true }).dblclick();
  await expect(dialog.getByRole("button", { name: "Sending SOS…" })).toBeDisabled();
  await expect(dialog.getByText("SOS sent to 2 of 3 trusted contacts.")).toBeVisible();
  expect(posts).toBe(1);
  expect(payload).toMatchObject({ phone_numbers: ["+919876543210", "+14155552671", "+442071838750"] });
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
