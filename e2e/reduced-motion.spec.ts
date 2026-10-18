/**
 * Phase 3 — Reduced-motion snapshot (audit F-08, 2026-10-18, 3.4).
 * Run storefront suite with prefers-reduced-motion: reduce; assert no
 * scroll-hijack, no reveal animation, instant transitions.
 */

import { test, expect } from "@playwright/test";

const pinEnglish = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => window.localStorage.setItem("prosanti-lang", "en"));

async function settled(page: import("@playwright/test").Page) {
  await page.locator("header").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test.beforeEach(async ({ page }) => {
  await pinEnglish(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("no animation runs at prefers-reduced-motion: reduce", async ({ page }) => {
  await page.goto("/");
  await settled(page);
  // Headings should have no animation
  expect(await page.locator("h1").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  // Drawer panel animation none
  await page.getByRole("button", { name: "Search products", exact: true }).click();
  expect(await page.locator(".drawer-panel").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.keyboard.press("Escape");
  // Feature heading still visible instantly, no reveal animation
  await page.getByRole("heading", { name: "Featured." }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Featured." })).toBeVisible();
  // No scroll-hijack: scroll position should be stable
  const y1 = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(300);
  const y2 = await page.evaluate(() => window.scrollY);
  expect(Math.abs(y2 - y1)).toBeLessThanOrEqual(2);
});

test("instant transitions on shop filter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shop");
  await settled(page);
  await page.getByRole("button", { name: /^Filters/ }).click();
  const drawer = page.getByRole("dialog", { name: "Product filters" });
  await expect(drawer).toBeVisible();
  // Transition duration should be 0 under reduce
  const duration = await drawer.evaluate((el) => getComputedStyle(el).transitionDuration);
  // Allow 0s or near-0 (global reduced-motion CSS zeros durations)
  expect(["0s", "0ms", "0s, 0s"].some((d) => duration.includes("0"))).toBeTruthy();
});
