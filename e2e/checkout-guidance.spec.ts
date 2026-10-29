import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRODUCTS, CATEGORIES, DELIVERY_ZONES, type Shop } from "../src/lib/catalog";
import { translations } from "../src/lib/translations";
import { CART_STORAGE_KEY } from "../src/lib/cart";
const shop: Shop = { id: "checkout-qa", slug: "checkout-qa", name: "QA shop", phone: "01700000000", zoneIds: DELIVERY_ZONES.map(z => z.id), prepMinutes: 15, commissionPct: 15, status: "active", isOpen: true, ratingAvg: 0, ratingCount: 0 };
const product = { ...PRODUCTS[0], shopId: shop.id };
for (const lang of ["en", "bn"] as const) {
  test(`checkout navigation, validation and failed-request recovery: ${lang}`, async ({ page }, info) => {
    const w = translations[lang].checkout;
    let attempts = 0;
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ lang, key, id }) => { localStorage.setItem("prosanti-lang", lang); localStorage.setItem(key, JSON.stringify([{ productId: id, variantLabel: "L", qty: 1 }])); }, { lang, key: CART_STORAGE_KEY, id: product.id });
    await page.route("**/api/products", route => route.fulfill({ json: { source: "live", products: [product], categories: CATEGORIES, shops: [shop] } }));
    await page.route("**/api/zones", route => route.fulfill({ json: { zones: DELIVERY_ZONES } }));
    // All order POSTs are intercepted: no real order can be created.
    await page.route("**/api/orders", async route => { attempts++; if (attempts === 1) await pending; await route.fulfill({ status: 503, json: { error: "Service unavailable" } }); });
    await page.goto("/checkout");
    const progress = page.getByRole("navigation", { name: w.progressLabel, exact: true });
    for (const button of await progress.getByRole("button").all()) {
      const bounds = await button.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    await progress.getByRole("button").nth(1).click();
    await expect(page.locator("#checkout-step-2-heading")).toBeFocused();
    await progress.getByRole("button").nth(2).click();
    await expect(page.locator("#checkout-step-3-heading")).toBeFocused();
    const submit = page.locator('main button[type="submit"]').filter({ hasText: w.placeOrder }).first();
    await submit.click();
    const name = page.getByPlaceholder(/রাহাত আহমেদ/);
    await expect(page.getByPlaceholder("017XXXXXXXX")).toBeFocused();
    const area = page.getByLabel(w.paraAria, { exact: true });
    await expect(area).toHaveAttribute("aria-describedby", "err-area");
    await expect(page.locator("#err-area")).not.toBeEmpty();
    expect(attempts).toBe(0);
    await name.fill("QA Customer");
    const phone = page.getByPlaceholder("017XXXXXXXX");
    await phone.fill("01712345678");
    await area.fill("Boropara");
    const address = page.getByPlaceholder(w.fullAddressPlaceholder, { exact: true });
    await address.fill("House 12, College Road");
    await submit.click();
    try { await expect(page.locator("main form").first()).toHaveAttribute("aria-busy", "true"); }
    finally { release(); }
    const error = page.getByTestId("order-error");
    await expect(error).toBeFocused();
    await expect(page.getByTestId("order-retry")).toBeVisible();
    expect(attempts).toBe(1);
    await expect(name).toHaveValue("QA Customer");
    await expect(phone).toHaveValue("01712345678");
    await expect(area).toHaveValue("Boropara");
    await expect(address).toHaveValue("House 12, College Road");
    await expect(page.locator("main form").first()).toHaveAttribute("aria-busy", "false");
    const scan = await new AxeBuilder({ page }).include('[data-testid="checkout-progress"]').include('[data-testid="order-error"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("checkout-recovery.png") });
    await page.getByTestId("order-retry").click();
    await expect(error).toBeFocused();
    await expect.poll(() => attempts).toBe(2);
    await expect(address).toHaveValue("House 12, College Road");
  });
}
