/**
 * Phase 3 — Responsive audit (audit 2026-10-18, 3.1).
 * 360×800, 768×1024, 1280×900: header fits, filter drawer, no overflow.
 */

import { test, expect } from "@playwright/test";

const pinEnglish = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => window.localStorage.setItem("prosanti-lang", "en"));

async function settled(page: import("@playwright/test").Page) {
  await page.locator("header").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function noOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

for (const { width, height, name } of [
  { width: 360, height: 800, name: "360×800" },
  { width: 768, height: 1024, name: "768×1024" },
  { width: 1280, height: 900, name: "1280×900" },
]) {
  test(`responsive @ ${name} — header + shop + product + checkout`, async ({ page }, info) => {
    await pinEnglish(page);
    await page.setViewportSize({ width, height });

    for (const route of ["/", "/shop", "/product/heritage-green-panjabi", "/checkout"]) {
      await page.goto(route);
      await settled(page);
      await noOverflow(page);
      await expect(page.locator("header").first()).toBeVisible();
      // Footer always visible
      await expect(page.locator("footer").first()).toBeVisible();
      // Touch targets ≥44px on mobile
      if (width <= 390) {
        const bottomNav = page.locator("[data-testid='bottom-nav'], nav[aria-label='Bottom navigation']");
        if (await bottomNav.count()) {
          const buttons = bottomNav.locator("a, button");
          const n = await buttons.count();
          for (let i = 0; i < Math.min(n, 4); i++) {
            const box = await buttons.nth(i).boundingBox();
            if (box) expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      }
      await page.screenshot({
        path: info.outputPath(`${route.replaceAll("/", "_") || "home"}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}

test("filter drawer action visible while scrolling (mobile)", async ({ page }) => {
  await pinEnglish(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shop");
  await settled(page);
  const filters = page.getByRole("button", { name: /^Filters/ });
  await filters.click();
  const drawer = page.getByRole("dialog", { name: "Product filters" });
  await expect(drawer).toBeVisible();
  // Scroll drawer content
  await drawer.evaluate((el) => (el.scrollTop = 500));
  // Action button (Show N products) must still be visible (sticky footer)
  await expect(drawer.getByRole("button", { name: /Show \d+ products/ })).toBeVisible();
});

test("no clipped text or overlapping elements", async ({ page }) => {
  await pinEnglish(page);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ["/", "/shop", "/product/heritage-green-panjabi"]) {
    await page.goto(route);
    await settled(page);
    // Check for overlapping via elementFromPoint at center of each card
    const overlaps = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("article"));
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const el = document.elementFromPoint(cx, cy);
        if (el && !card.contains(el)) return card.outerHTML.slice(0, 200);
      }
      return null;
    });
    expect(overlaps).toBeNull();
  }
});
