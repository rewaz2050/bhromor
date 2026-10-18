/**
 * Accessibility — automated Axe audit (audit F-07, 2026-10-18).
 *
 * The storefront already has Axe checks inside storefront.spec.ts for the
 * responsive/functional flows. This spec is the *pure* a11y gate: every
 * critical customer journey page is swept with `wcag2a` + `wcag2aa` +
 * `wcag21aa` at mobile + desktop, and any `critical`/`serious` violation
 * fails the suite.
 *
 * The suite is skipped when no live catalog is configured — it still needs a
 * painted shelf — but when it runs it must pass. CI runs it alongside the
 * storefront suite (same Playwright project).
 */

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pinEnglish = (target: { addInitScript: (fn: () => void) => Promise<void> }) =>
  target.addInitScript(() => window.localStorage.setItem("prosanti-lang", "en"));

async function noA11yViolations(page: import("@playwright/test").Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  // Surface as a readable diff, not a wall of node objects.
  const summary = violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, summary: n.failureSummary })),
    }));

  expect(
    summary,
    summary.length ? JSON.stringify(summary, null, 2) : undefined,
  ).toEqual([]);
}

const CRITICAL_ROUTES = ["/", "/shop", "/cart", "/checkout", "/track", "/about", "/faq"] as const;

// Mobile + desktop — the header, bottom nav, drawer, and filter bar are
// different DOM at different widths, so both must be clean.
for (const width of [375, 1280]) {
  for (const route of CRITICAL_ROUTES) {
    test(`a11y — ${route} @ ${width}px — no critical/serious violations`, async ({ page }) => {
      await pinEnglish(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      // Storefront renders header as first <header>; wait for it to prove the
      // shell is painted before running Axe — otherwise the scan races the
      // LiveCatalogBoot hydration.
      await page.locator("header").first().waitFor({ timeout: 10_000 });
      await page.evaluate(() => document.fonts.ready);
      await noA11yViolations(page);
    });
  }
}

test("a11y — product page — no critical/serious violations", async ({ page }) => {
  await pinEnglish(page);
  await page.goto("/product/heritage-green-panjabi");
  await page.locator("header").first().waitFor({ timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await noA11yViolations(page);
});

test("a11y — search dialog — no critical/serious violations", async ({ page }) => {
  await pinEnglish(page);
  await page.goto("/");
  await page.locator("header").first().waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Search products", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Search products" });
  await expect(dialog).toBeVisible();
  await noA11yViolations(page);
});
