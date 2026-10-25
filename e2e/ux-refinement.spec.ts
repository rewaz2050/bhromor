import { test, expect } from "@playwright/test";
import { PRODUCTS, CATEGORIES, DELIVERY_ZONES, type Shop } from "../src/lib/catalog";

// Browser-only fixtures: never seed a database or place a real order.
const shop: Shop = {
  id: "ux-fixture", slug: "ux-fixture", name: "QA shop", phone: "01700000000",
  zoneIds: DELIVERY_ZONES.map(z => z.id), prepMinutes: 15, commissionPct: 15,
  status: "active", isOpen: true, ratingAvg: 0, ratingCount: 0,
};
const products = PRODUCTS.slice(0, 2).map(p => ({ ...p, shopId: shop.id }));
test.beforeEach(async ({ page }) => {
  await page.route("**/api/products", route => route.fulfill({ json: {
    source: "live", products, categories: CATEGORIES, shops: [shop],
  } }));
  await page.route("**/api/zones", route => route.fulfill({ json: { zones: DELIVERY_ZONES } }));
});

for (const lang of ["en", "bn"] as const) {
  for (const width of [320, 390, 1440]) {
    test(`small catalog, disclosure and overflow: ${lang} ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/");
      await expect(page.getByTestId("whole-shelf")).toBeVisible();
      // Two pieces should not be repeated in best/new/offer merchandising.
      await expect(page.locator("#offers, #best-sellers-rail, #new-arrivals-rail")).toHaveCount(0);
      const disclosure = page.locator("details").first();
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
      await disclosure.locator("summary").press("Enter");
      await expect(disclosure).not.toHaveAttribute("open");
      for (const route of ["/", "/shop"]) {
        if (route !== "/") await page.goto(route);
        await expect(page.locator("h1")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`${route === "/" ? "home" : "shop"}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
}

test("mobile bag estimate and optional checkout address retain input", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("prosanti-lang", "en"));
  await page.goto("/");
  await page.getByRole("button", { name: "Quick add Heritage Green Panjabi to cart" }).click();
  const options = page.getByRole("dialog", { name: "Select options for Heritage Green Panjabi" });
  await options.getByRole("button", { name: "L", exact: true }).click();
  await options.getByRole("button", { name: "Add to Bag →", exact: true }).click();
  const bag = page.getByRole("dialog", { name: "Your Bag" });
  await expect(bag.getByText("Choose your area for a delivery estimate")).toBeVisible();
  await bag.getByRole("link", { name: "Checkout →" }).click();
  const disclosure = page.locator("details").filter({ hasText: "Add house, road or landmark (optional)" });
  const house = disclosure.getByLabel(/House no\./i);
  await expect(house).toBeHidden();
  await disclosure.locator("summary").click();
  await house.fill("12/A");
  await disclosure.locator("summary").click();
  await expect(house).toBeHidden();
  await disclosure.locator("summary").click();
  await expect(house).toHaveValue("12/A");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
