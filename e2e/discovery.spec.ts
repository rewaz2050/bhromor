import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRODUCTS, CATEGORIES } from "../src/lib/catalog";

const words = {
  en: { search: "Search products", input: "Search by name, category or SKU", clear: "Clear search", close: "Close search", menu: "Menu", openMenu: "Open menu", closeMenu: "Close menu", filters: "Filters", filterDialog: "Product filters", festive: "Festive", reset: "Reset" },
  bn: { search: "পণ্য অনুসন্ধান", input: "নাম, ধরন বা পণ্য কোড দিয়ে খুঁজুন", clear: "অনুসন্ধান মুছুন", close: "অনুসন্ধান বন্ধ করুন", menu: "মেনু", openMenu: "মেনু খুলুন", closeMenu: "মেনু বন্ধ করুন", filters: "ফিল্টার", filterDialog: "পণ্যের ফিল্টার", festive: "উৎসবের", reset: "রিসেট" },
};

for (const lang of ["en", "bn"] as const) {
  test(`mobile search and menu are named, trapped and usable: ${lang}`, async ({ page }, info) => {
    const w = words[lang];
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
    await page.route("**/api/products", route => route.fulfill({ json: { source: "live", products: [PRODUCTS[0]], categories: CATEGORIES, shops: [] } }));
    await page.route("**/api/contact", route => route.fulfill({ json: { whatsapp: "01712345678", phone: null, email: null } }));
    await page.goto("/");
    const trigger = page.getByRole("button", { name: w.search, exact: true });
    await trigger.click();
    const search = page.getByRole("dialog", { name: w.search, exact: true });
    const input = search.getByRole("searchbox", { name: w.input, exact: true });
    await expect(input).toBeFocused();
    await input.fill(PRODUCTS[0].sku);
    await expect(search.getByRole("status")).toContainText(lang === "en" ? "1 match" : "১");
    const clear = search.getByRole("button", { name: w.clear, exact: true });
    const box = await clear.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await clear.click();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await input.fill("not-in-this-catalog");
    await expect(search.getByTestId("search-ask-whatsapp")).toBeVisible();
    expect(await search.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const scanSearch = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scanSearch.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.screenshot({ path: info.outputPath("search.png") });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(search).toHaveCount(0);
    // Use the header trigger, not the separate bottom-navigation trigger.
    const menuTrigger = page.locator("header").first().getByRole("button", { name: w.openMenu, exact: true });
    await menuTrigger.click();
    const menu = page.getByRole("dialog", { name: w.menu, exact: true });
    await expect(menu).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await menu.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    const scanMenu = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scanMenu.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.screenshot({ path: info.outputPath("menu.png") });
    await menu.getByRole("button", { name: w.closeMenu, exact: true }).click();
    await expect(menuTrigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test(`mobile filter dialog announces changes and resets: ${lang}`, async ({ page }) => {
    const w = words[lang];
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
    await page.goto("/shop");
    await page.getByRole("button", { name: w.filters, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: w.filterDialog, exact: true });
    await dialog.getByRole("button", { name: w.festive, exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText(lang === "en" ? "0 products" : "০টি পণ্য");
    await expect(page).toHaveURL(/mood=festive/);
    const scan = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    await dialog.getByRole("button", { name: w.reset, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/mood=/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("search waits for the catalog without claiming zero matches", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("prosanti-lang", "en"));
  let release = () => {};
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/products", async route => {
    await ready;
    await route.fulfill({ json: { source: "live", products: [PRODUCTS[0]], categories: CATEGORIES, shops: [] } });
  });
  await page.goto("/");
  try {
    await page.getByRole("button", { name: "Search products", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Search products", exact: true });
    const input = dialog.getByRole("searchbox");
    await input.fill(PRODUCTS[0].sku);
    await expect(dialog.getByRole("status")).toHaveText("Loading products…");
    release();
    await expect(dialog.getByRole("status")).toContainText("1 match");
    await expect(input).toHaveValue(PRODUCTS[0].sku);
    await expect(input).toBeFocused();
  } finally { release(); }
});
