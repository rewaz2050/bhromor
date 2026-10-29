import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRODUCTS, CATEGORIES, DELIVERY_ZONES, type Shop } from "../src/lib/catalog";
import { WISHLIST_STORAGE_KEY } from "../src/lib/wishlist-store";
const shop: Shop = { id: "wishlist-qa", slug: "wishlist-qa", name: "QA shop", phone: "01700000000", zoneIds: DELIVERY_ZONES.map(z => z.id), prepMinutes: 15, commissionPct: 15, status: "active", isOpen: true, ratingAvg: 0, ratingCount: 0 };
const products = PRODUCTS.slice(0, 2).map(product => ({ ...product, shopId: shop.id }));
const payload = { source: "live", products, categories: CATEGORIES, shops: [shop] };
const words = {
  en: { loading: "Loading the products in this list", unavailable: "Your saved list is still here", retry: "Try loading products again", clear: "Clear all", empty: "Your wishlist is waiting.", missing: "These items are not listed right now", mine: "See my wishlist", saved: "Saved —" },
  bn: { loading: "এই তালিকার পণ্য লোড হচ্ছে", unavailable: "আপনার সেভ করা তালিকা এখানেই আছে", retry: "পণ্য আবার লোড করুন", clear: "সব মুছুন", empty: "আপনার পছন্দের তালিকা অপেক্ষা করছে।", missing: "এই পণ্যগুলো এখন তালিকাভুক্ত নেই", mine: "আমার তালিকা দেখুন", saved: "রাখা হয়েছে" },
};
for (const lang of ["en", "bn"] as const) {
  test(`saved items survive catalog failure and clearing still needs confirmation: ${lang}`, async ({ page }, info) => {
    const w = words[lang];
    const ids = [products[0].id, "unlisted-wishlist-qa"];
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(({ lang, ids, key }) => { localStorage.setItem("prosanti-lang", lang); localStorage.setItem(key, JSON.stringify(ids)); }, { lang, ids, key: WISHLIST_STORAGE_KEY });
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    await page.route("**/api/products", async route => {
      if (++calls === 1) { await pending; await route.fulfill({ status: 503, json: {} }); }
      else await route.fulfill({ json: payload });
    });
    try {
      await page.goto("/wishlist");
      const main = page.locator("main");
      await expect(main.getByRole("status")).toContainText(w.loading);
      await expect(main.getByRole("heading", { name: w.empty, exact: true })).toHaveCount(0);
      release();
      await expect(main.getByRole("status")).toContainText(w.unavailable);
      const scan = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("saved-list-unavailable.png") });
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), WISHLIST_STORAGE_KEY)).toEqual(ids);
      await main.getByRole("button", { name: w.retry, exact: true }).click();
      await expect(main.locator('[data-list="wishlist"] article')).toHaveCount(1);
      await expect(main.getByRole("status").filter({ hasText: lang === "en" ? "Not currently listed: 1" : "১টি পণ্য" })).toBeVisible();
      page.once("dialog", dialog => dialog.dismiss());
      await main.getByRole("button", { name: w.clear, exact: true }).click();
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), WISHLIST_STORAGE_KEY)).toEqual(ids);
      page.once("dialog", dialog => dialog.accept());
      await main.getByRole("button", { name: w.clear, exact: true }).click();
      await expect(main.getByRole("heading", { name: w.empty, exact: true })).toBeVisible();
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), WISHLIST_STORAGE_KEY)).toEqual([]);
      expect(calls).toBe(2);
    } finally { release(); }
  });

  test(`shared list saves all available items without replacing existing favourites: ${lang}`, async ({ page }, info) => {
    const w = words[lang];
    const original = "own-saved-qa";
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(({ lang, key, original }) => { localStorage.setItem("prosanti-lang", lang); localStorage.setItem(key, JSON.stringify([original])); }, { lang, key: WISHLIST_STORAGE_KEY, original });
    await page.route("**/api/products", route => route.fulfill({ json: payload }));
    await page.goto(`/wishlist?ids=${products.map(p => p.id).join(",")}`);
    const main = page.locator("main");
    await expect(main.locator('[data-list="wishlist"] article')).toHaveCount(2);
    const save = main.getByTestId("save-shared");
    await save.click();
    await expect(save).toContainText(w.saved);
    await expect(save).toBeDisabled();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), WISHLIST_STORAGE_KEY)).toEqual([original, ...products.map(p => p.id)]);
    const scan = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("shared-list-saved.png") });
    await main.getByRole("link", { name: w.mine, exact: true }).click();
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(main.getByTestId("wishlist-shared")).toHaveCount(0);
    await expect(main.getByRole("button", { name: w.clear, exact: true })).toBeVisible();
  });

  test(`unlisted shared references are not described as an empty personal list: ${lang}`, async ({ page }) => {
    const w = words[lang];
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(({ lang, key, id }) => { localStorage.setItem("prosanti-lang", lang); localStorage.setItem(key, JSON.stringify([id])); }, { lang, key: WISHLIST_STORAGE_KEY, id: products[0].id });
    await page.route("**/api/products", route => route.fulfill({ json: payload }));
    await page.goto("/wishlist?ids=unlisted-shared-qa");
    await expect(page.locator("main").getByRole("heading", { name: w.missing, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: w.empty, exact: true })).toHaveCount(0);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), WISHLIST_STORAGE_KEY)).toEqual([products[0].id]);
  });
}
