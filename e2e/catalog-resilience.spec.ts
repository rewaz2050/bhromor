import { test, expect, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRODUCTS, CATEGORIES, DELIVERY_ZONES, type Shop } from "../src/lib/catalog";
import { CART_STORAGE_KEY } from "../src/lib/cart";

// Local response fixtures only. No database writes or order submission.
const shop: Shop = { id: "resilience-qa", slug: "resilience-qa", name: "QA shop", phone: "01700000000", zoneIds: DELIVERY_ZONES.map(z => z.id), prepMinutes: 15, commissionPct: 15, status: "active", isOpen: true, ratingAvg: 0, ratingCount: 0 };
const product = { ...PRODUCTS[0], shopId: shop.id };
const payload = { source: "live", products: [product], categories: CATEGORIES, shops: [shop] };
const lines = [{ productId: product.id, variantLabel: "L", qty: 1 }];
const words = {
  en: { retry: "Try loading products again", empty: "No products to show right now", bag: "Your Bag", saved: "Your saved bag is still on this device.", close: "Close bag", search: "Search products" },
  bn: { retry: "পণ্য আবার লোড করুন", empty: "এখন দেখানোর মতো পণ্য নেই", bag: "আপনার ব্যাগ", saved: "আপনার ব্যাগ এই ডিভাইসেই আছে।", close: "ব্যাগ বন্ধ করুন", search: "পণ্য অনুসন্ধান" },
};

for (const lang of ["en", "bn"] as const) {
  test(`home and search recover together without losing the query: ${lang}`, async ({ page }) => {
    const w = words[lang];
    let calls = 0;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
    await page.route("**/api/products", route => route.fulfill(++calls === 1 ? { status: 503, json: {} } : { json: payload }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: w.empty, exact: true })).toBeVisible();
    await page.getByRole("button", { name: w.search, exact: true }).click();
    const search = page.getByRole("dialog", { name: w.search, exact: true });
    const input = search.getByRole("searchbox");
    await input.fill(product.sku);
    await search.getByRole("button", { name: w.retry, exact: true }).click();
    await expect(input).toHaveValue(product.sku);
    await expect(input).toBeFocused();
    await expect(search.getByRole("status")).toContainText(lang === "en" ? "1 match" : "১");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("whole-shelf")).toBeVisible();
    await expect(page.getByRole("heading", { name: w.empty, exact: true })).toHaveCount(0);
    expect(calls).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test(`saved bag survives an unavailable catalog, retries and restores focus: ${lang}`, async ({ page }, info) => {
    const w = words[lang];
    let calls = 0;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(({ lang, key, lines }) => { localStorage.setItem("prosanti-lang", lang); localStorage.setItem(key, JSON.stringify(lines)); }, { lang, key: CART_STORAGE_KEY, lines });
    await page.route("**/api/products", route => route.fulfill(++calls === 1 ? { status: 503, json: {} } : { json: payload }));
    await page.route("**/api/zones", route => route.fulfill({ json: { zones: DELIVERY_ZONES } }));
    await page.goto("/");
    const trigger = page.locator("header").getByRole("button", { name: lang === "en" ? /^Open bag,/ : /^ব্যাগ খুলুন/ });
    await expect(trigger).toHaveAttribute("aria-label", lang === "en" ? "Open bag, saved items awaiting product details" : "ব্যাগ খুলুন, সেভ করা পণ্যের তথ্যের অপেক্ষায়");
    await trigger.click();
    const bag = page.getByRole("dialog", { name: w.bag, exact: true });
    await expect(bag.getByRole("status")).toContainText(w.saved);
    await expect(bag.getByText(lang === "en" ? "Your bag is empty." : "আপনার ব্যাগ খালি।", { exact: true })).toHaveCount(0);
    const scan = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await bag.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("saved-bag-unavailable.png") });
    await bag.getByRole("button", { name: w.retry, exact: true }).click();
    await expect(bag.getByTestId("bag-checkout")).toBeVisible();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), CART_STORAGE_KEY)).toEqual(lines);
    expect(calls).toBe(2);
    await bag.getByRole("button", { name: w.close, exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-label", lang === "en" ? "Open bag, 1 item" : "ব্যাগ খুলুন, ১টি পণ্য");
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
}

for (const path of ["/cart", "/checkout"]) {
  test(`saved bag remains recoverable on ${path}`, async ({ page }) => {
    let calls = 0;
    await page.addInitScript(({ key, lines }) => { localStorage.setItem("prosanti-lang", "en"); localStorage.setItem(key, JSON.stringify(lines)); }, { key: CART_STORAGE_KEY, lines });
    await page.route("**/api/products", route => route.fulfill(++calls === 1 ? { status: 503, json: {} } : { json: payload }));
    await page.route("**/api/zones", route => route.fulfill({ json: { zones: DELIVERY_ZONES } }));
    await page.goto(path);
    const main = page.locator("main");
    await expect(main.getByRole("status")).toContainText(words.en.saved);
    await expect(main.getByText(/Your cart is empty|Nothing to check out yet/)).toHaveCount(0);
    await main.getByRole("button", { name: words.en.retry, exact: true }).click();
    await expect(main.getByRole("button", { name: words.en.retry, exact: true })).toHaveCount(0);
    if (path === "/checkout") await expect(main.getByRole("region", { name: "Your details", exact: true })).toBeVisible();
    else await expect(main.getByText(product.name, { exact: true }).first()).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Open bag, 1 item", exact: true })).toBeVisible();
    expect(calls).toBe(2);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), CART_STORAGE_KEY)).toEqual(lines);
  });
}

test("an unanswered catalog reaches recovery instead of loading forever", async ({ page }) => {
  let calls = 0;
  let held: Route | undefined;
  await page.addInitScript(() => localStorage.setItem("prosanti-lang", "en"));
  await page.route("**/api/products", route => {
    if (++calls === 1) { held = route; return; }
    return route.fulfill({ json: payload });
  });
  try {
    await page.goto("/");
    const retry = page.getByRole("button", { name: words.en.retry, exact: true });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await retry.click();
    await expect(page.getByTestId("whole-shelf")).toBeVisible();
    expect(calls).toBe(2);
  } finally { await held?.abort().catch(() => {}); }
});
