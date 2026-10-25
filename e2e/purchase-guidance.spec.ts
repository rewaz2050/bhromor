import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PRODUCTS, CATEGORIES, DELIVERY_ZONES, type Shop } from "../src/lib/catalog";
import { CART_STORAGE_KEY } from "../src/lib/cart";
const shop: Shop = { id: "purchase-qa", slug: "purchase-qa", name: "QA shop", phone: "01700000000", zoneIds: DELIVERY_ZONES.map(z => z.id), prepMinutes: 15, commissionPct: 15, status: "active", isOpen: true, ratingAvg: 0, ratingCount: 0 };
const product = { ...PRODUCTS[0], nameBn: "পরীক্ষার পাঞ্জাবি", shopId: shop.id, sizes: ["XXL", "M", "L"], colors: ["Green", "Black"], inStock: true, lowStock: false, sizeStock: { M: 0, L: 2, XXL: 8 } };
for (const lang of ["en", "bn"] as const) {
  for (const allOut of [false, true]) {
    test(`mobile purchase options: ${lang}, all sizes unavailable=${allOut}`, async ({ page }, info) => {
      const en = lang === "en";
      await page.setViewportSize({ width: 320, height: 844 });
      await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
      const p = allOut ? { ...product, sizeStock: { M: 0, L: 0, XXL: 0 } } : product;
      await page.route("**/api/products", route => route.fulfill({ json: { source: "live", products: [p], categories: CATEGORIES, shops: [shop] } }));
      await page.route("**/api/zones", route => route.fulfill({ json: { zones: DELIVERY_ZONES } }));
      await page.goto("/");
      const trigger = page.getByRole("button", { name: en ? `Quick add ${product.name} to cart` : "পরীক্ষার পাঞ্জাবি — ব্যাগে যোগ করার পছন্দ বেছে নিন", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: en ? `Select options for ${product.name}` : "পরীক্ষার পাঞ্জাবি — পছন্দ নির্বাচন করুন", exact: true });
      await expect(dialog.getByTestId("quick-add-buy-now")).toBeDisabled();
      await expect(dialog.getByRole("button", { name: en ? "M — Sold out" : "M — স্টক শেষ" })).toBeDisabled();
      if (allOut) {
        await expect(dialog.getByRole("status")).toContainText(en ? "All listed sizes" : "দেখানো সব সাইজ");
      } else {
        await expect(dialog.getByRole("status")).toContainText(en ? "Choose an available size" : "ব্যাগে যোগ করার আগে");
        await dialog.getByRole("button", { name: en ? "L — 2 left" : "L — ২টি বাকি", exact: true }).click();
        await dialog.getByRole("button", { name: "Black", exact: true }).click();
        await dialog.getByRole("button", { name: en ? "Increase quantity" : "পরিমাণ বাড়ান", exact: true }).click();
        await expect(dialog.getByRole("status")).toContainText("L · Black");
        await expect(dialog.getByRole("group", { name: en ? "Quantity" : "পরিমাণ", exact: true })).toContainText(en ? "2" : "২");
      }
      const scan = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
      expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath("options.png") });
      if (!allOut) {
        await dialog.getByRole("button", { name: en ? "Add to Bag →" : "ব্যাগে যোগ করুন →", exact: true }).click();
        await expect(page.getByRole("dialog", { name: en ? "Your Bag" : "আপনার ব্যাগ", exact: true })).toBeVisible();
        expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), CART_STORAGE_KEY)).toEqual([{ productId: product.id, variantLabel: "Black · L", qty: 2 }]);
      } else {
        await dialog.getByRole("button", { name: en ? "Close product options" : "পণ্যের পছন্দ নির্বাচন বন্ধ করুন", exact: true }).click();
        await expect(trigger).toBeFocused();
      }
    });
  }
}
