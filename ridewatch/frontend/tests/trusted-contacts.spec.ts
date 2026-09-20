import { test, expect, type Page } from "@playwright/test";
import { mockApp, startRide } from "./fixtures";

async function add(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: /Add trusted contact/ }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Save contact" }).click();
}

test("desktop navigation opens the trusted contacts page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Trusted contacts" }).click();
  await expect(page).toHaveURL(/\/trusted-contacts$/);
  await expect(page.getByRole("heading", { name: "Trusted contacts", level: 1 })).toBeVisible();
});

test("mobile menu is accessible, navigates, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open navigation menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Trusted contacts" }).click();
  await expect(page).toHaveURL(/\/trusted-contacts$/);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
});

test("dedicated page handles empty, add, reload, edit, and remove", async ({ page }) => {
  await page.goto("/trusted-contacts");
  await expect(page.getByRole("heading", { name: "No trusted contacts yet." })).toBeVisible();
  await expect(page.getByText("Add someone you may want to share a live trip with.")).toBeVisible();
  await add(page, "Alice", "+91 98765 43210");
  await expect(page.getByText("+919876543210")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Alice")).toBeVisible();
  await page.getByRole("listitem").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Asha");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Asha")).toBeVisible();
  await page.getByRole("listitem").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "No trusted contacts yet." })).toBeVisible();
  await expect(page.getByText("RideWatch never sends them to the server.")).toBeVisible();
});

test("dedicated page enforces three contacts and recovers malformed storage", async ({ page }) => {
  await page.goto("/trusted-contacts");
  await add(page, "Alice", "+919876543210");
  await add(page, "Bob", "+919876543211");
  await add(page, "Chitra", "+919876543212");
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Maximum of 3 trusted contacts reached.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add trusted contact/ })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("ridewatch.trusted-contacts.v1", "{malformed"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "No trusted contacts yet." })).toBeVisible();
});

test("SOS reads contacts created on the dedicated page", async ({ page }) => {
  await mockApp(page);
  await page.goto("/trusted-contacts");
  await add(page, "Alice", "+919876543210");
  await page.getByRole("link", { name: "Plan ride" }).click();
  await startRide(page);
  await page.getByRole("button", { name: "Get help / SOS" }).click();
  const dialog = page.getByRole("dialog", { name: "Emergency assistance" });
  await expect(dialog.getByText("Alice")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "SMS" })).toBeVisible();
});

test("zero-contact SOS links directly to trusted contacts", async ({ page }) => {
  await mockApp(page); await startRide(page);
  await page.getByRole("button", { name: "Get help / SOS" }).click();
  const dialog = page.getByRole("dialog", { name: "Emergency assistance" });
  await expect(dialog.getByText("No trusted contacts added.")).toBeVisible();
  await dialog.getByRole("link", { name: "Add trusted contact" }).click();
  await expect(page).toHaveURL(/\/trusted-contacts$/);
});
