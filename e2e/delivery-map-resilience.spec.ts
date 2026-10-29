import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
let script = ""; let css = "";
test.beforeAll(async () => {
  const result = await build({ entryPoints: [path.resolve("e2e/fixtures/delivery-maps/app.tsx")], bundle: true, write: false, outfile: "delivery-maps.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": path.resolve("src") }, loader: { ".png": "dataurl" } });
  script = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  css = result.outputFiles.find(file => file.path.endsWith(".css"))!.text;
});
for (const width of [320, 1280]) for (const lang of ["en", "bn"] as const) {
  test(`checkout/tracker retain pins and recover blocked tiles: ${width} ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
    await page.evaluate(lang => { localStorage.setItem("prosanti-lang", lang); document.cookie = `prosanti-lang=${lang}; path=/`; }, lang);
    let failed = true; let cdnRequests = 0;
    await page.route("**/unpkg.com/**", route => { cdnRequests++; return route.abort(); });
    await page.route(/https:\/\/[^/]+\.tile\.openstreetmap\.org\//, route => failed ? route.abort() : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dfe8df"/></svg>' }));
    await page.route("**/__delivery_maps.js", route => route.fulfill({ contentType: "application/javascript", body: script }));
    await page.route("**/__delivery_maps.css", route => route.fulfill({ contentType: "text/css", body: css }));
    await page.route("**/__delivery_maps.html", route => route.fulfill({ contentType: "text/html", body: `<html lang="${lang}"><head>${sheets.map(href => `<link rel="stylesheet" href="${href}">`).join("")}<link rel="stylesheet" href="/__delivery_maps.css"></head><body><div id="delivery-maps-qa"></div><script src="/__delivery_maps.js"></script></body></html>` }));
    await page.goto("/__delivery_maps.html");
    const checkout = page.getByTestId("checkout-map"); const tracker = page.getByTestId("tracker-map");
    await expect(checkout.getByRole("status")).toContainText(lang === "bn" ? "রাস্তার বিবরণ" : "Street details");
    await expect(tracker.getByRole("status")).toContainText(lang === "bn" ? "রাস্তার বিবরণ" : "Street details");
    await expect(checkout.locator(".leaflet-marker-icon")).toHaveCount(2);
    await expect(tracker.locator(".leaflet-marker-icon")).toHaveCount(2);
    expect(cdnRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await checkout.getByRole("region").click({ position: { x: 100, y: 100 } });
    await expect(checkout.getByTestId("selected-pin")).toHaveText("Pin selected");
    failed = false;
    const retry = lang === "bn" ? "ম্যাপ আবার চেষ্টা করুন" : "Retry map";
    await checkout.getByRole("button", { name: retry }).click();
    await tracker.getByRole("button", { name: retry }).click();
    await expect(checkout.getByRole("status")).toHaveCount(0);
    await expect(tracker.getByRole("status")).toHaveCount(0);
    await expect(checkout.getByTestId("selected-pin")).toHaveText("Pin selected");
    for (const map of [checkout, tracker]) {
      await expect.poll(() => map.locator("img.leaflet-tile").evaluateAll(images => images.some(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    }
  });
}
