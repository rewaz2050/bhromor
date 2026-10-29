import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";

// A browser component harness, not a production PDP test. It uses the real
// gallery, modal and app CSS; next/image is replaced only in this fixture.
let script = "";
test.beforeAll(async () => {
  const result = await build({ entryPoints: [path.resolve("e2e/fixtures/gallery/app.tsx")], bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": path.resolve("src"), "next/image": path.resolve("e2e/fixtures/gallery/image.tsx") } });
  script = result.outputFiles[0].text;
});
for (const lang of ["en", "bn"] as const) {
  test(`gallery modal, zoom and keyboard focus at 320px: ${lang}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
    await page.goto("/");
    const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
    const bodyClass = await page.locator("body").getAttribute("class") ?? "";
    await page.route("**/__gallery_qa.js", route => route.fulfill({ contentType: "application/javascript", body: script }));
    // Navigate to an isolated document instead of replacing a still-hydrating
    // Next page: its pending language effect must not mutate this fixture.
    await page.route("**/__gallery_qa.html", route => route.fulfill({ contentType: "text/html", body: `<html lang="${lang}"><head>${sheets.map(href => `<link rel="stylesheet" href="${href}">`).join("")}</head><body class="${bodyClass}"><div id="gallery-qa"></div><script src="/__gallery_qa.js"></script></body></html>` }));
    await page.goto("/__gallery_qa.html");
    const en = lang === "en";
    const thumb = page.getByRole("button", { name: en ? "View image 2: Back fabric" : "ছবি 2 দেখুন: Back fabric", exact: true });
    await thumb.click();
    await expect(thumb).toHaveAttribute("aria-pressed", "true");
    const trigger = page.getByTestId("gallery-zoom-trigger");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Back fabric", exact: true });
    const close = dialog.getByRole("button", { name: en ? "Close zoom" : "বড় ছবি বন্ধ করুন", exact: true });
    await expect(close).toBeFocused();
    expect(await page.locator("#gallery-qa").evaluate(el => (el as HTMLElement).inert)).toBe(true);
    const zoomIn = dialog.getByRole("button", { name: en ? "Zoom in" : "ছবি বড় করুন", exact: true });
    await zoomIn.click();
    await expect(zoomIn).toBeFocused();
    await expect(page.getByTestId("zoom-lightbox")).toHaveAttribute("data-scale", "1.50");
    await page.keyboard.press("ArrowRight");
    expect(await dialog.locator("img").evaluate(el => (el as HTMLElement).style.transform)).toContain("-40px");
    await page.keyboard.press("Home");
    await expect(page.getByTestId("zoom-lightbox")).toHaveAttribute("data-scale", "1.00");
    await expect(dialog.getByRole("button", { name: en ? "Zoom out" : "ছবি ছোট করুন", exact: true })).toBeDisabled();
    for (let i = 0; i < 9; i++) await page.keyboard.press("+");
    await expect(page.getByTestId("zoom-lightbox")).toHaveAttribute("data-scale", "4.00");
    await expect(zoomIn).toBeDisabled();
    await close.focus();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(parseFloat(await dialog.locator("img").evaluate(el => getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(0.0001);
    const scan = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    for (const control of await dialog.getByRole("button").all()) {
      const rect = await control.boundingBox();
      expect(rect?.width).toBeGreaterThanOrEqual(44); expect(rect?.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath("zoom.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.locator("#gallery-qa").evaluate(el => (el as HTMLElement).inert)).toBe(false);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
}
