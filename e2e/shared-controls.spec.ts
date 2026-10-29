import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRODUCTS, CATEGORIES } from "../src/lib/catalog";
import { CART_STORAGE_KEY } from "../src/lib/cart";
import { WISHLIST_STORAGE_KEY } from "../src/lib/wishlist-store";

// Native sharing and clipboard permissions are simulated, never opened for real.
for (const lang of ["en", "bn"] as const) {
  test(`localized counters and honest share recovery: ${lang}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(({ lang, cart, wishlist, id }) => {
      localStorage.setItem("prosanti-lang", lang);
      localStorage.setItem(cart, JSON.stringify([{ productId: id, variantLabel: "L", qty: 2 }]));
      localStorage.setItem(wishlist, JSON.stringify([id]));
      const qa = { shares: 0, copies: 0, cancel: true };
      Object.assign(window, { shareQA: qa });
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
        qa.shares++;
        throw new DOMException("Simulated", qa.cancel ? "AbortError" : "NotAllowedError");
      } });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {
        qa.copies++; throw new DOMException("Simulated permission denial", "NotAllowedError");
      } } });
    }, { lang, cart: CART_STORAGE_KEY, wishlist: WISHLIST_STORAGE_KEY, id: PRODUCTS[0].id });
    await page.route("**/api/products", route => route.fulfill({ json: { source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] } }));
    await page.goto("/wishlist");
    const header = page.locator("header");
    await expect(header.getByRole("button", { name: lang === "en" ? "Open bag, 2 items" : "ব্যাগ খুলুন, ২টি পণ্য", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(header.getByRole("link", { name: lang === "en" ? "Open wishlist, 1 saved item" : "পছন্দের তালিকা খুলুন, ১টি পণ্য সেভ করা", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    const link = page.getByTestId("wishlist-share");
    await link.click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { shareQA: { shares: number } }).shareQA.shares)).toBe(1);
    expect(await page.evaluate(() => (window as typeof window & { shareQA: { copies: number } }).shareQA.copies)).toBe(0);
    await page.evaluate(() => { (window as typeof window & { shareQA: { cancel: boolean } }).shareQA.cancel = false; });
    await link.click();
    await expect(page.getByText(lang === "en" ? "Sharing and copying are unavailable. Tap Share again to open WhatsApp." : "শেয়ার বা কপি করা যাচ্ছে না। WhatsApp খুলতে আবার শেয়ারে চাপুন।", { exact: true })).toBeVisible();
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\//);
    await expect(link).toHaveAccessibleDescription(lang === "en" ? "Sharing and copying are unavailable. Tap Share again to open WhatsApp." : "শেয়ার বা কপি করা যাচ্ছে না। WhatsApp খুলতে আবার শেয়ারে চাপুন।");
    expect(await page.evaluate(() => (window as typeof window & { shareQA: { copies: number } }).shareQA.copies)).toBe(1);
    expect(await link.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const scan = await new AxeBuilder({ page }).include("header").include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("share-recovery.png") });
  });
}


test("unknown page has readable recovery and an honest HTTP status", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => localStorage.setItem("prosanti-lang", "en"));
  const response = await page.goto("/no-such-page-final-qa");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the collection", exact: true })).toHaveAttribute("href", "/shop");
  const scan = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
