import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
let script = ""; let css = "";
test.beforeAll(async () => {
  const result = await build({ entryPoints: [path.resolve("e2e/fixtures/admin-map/app.tsx")], bundle: true, write: false, outfile: "map-qa.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": path.resolve("src") }, loader: { ".png": "dataurl" } });
  script = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  css = result.outputFiles.find(file => file.path.endsWith(".css"))!.text;
});
for (const width of [320, 1280]) {
  test(`map stays contained below the header and recovers from blocked tiles: ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
    let failed = true; let cdnRequests = 0;
    await page.route("**/unpkg.com/**", route => { cdnRequests++; return route.abort(); });
    await page.route(/https:\/\/[^/]+\.tile\.openstreetmap\.org\//, route => failed ? route.abort() : route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4ede5"/></svg>' }));
    await page.route("**/__admin_map.js", route => route.fulfill({ contentType: "application/javascript", body: script }));
    await page.route("**/__admin_map.css", route => route.fulfill({ contentType: "text/css", body: css }));
    await page.route("**/__admin_map.html", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head>${sheets.map(href => `<link rel="stylesheet" href="${href}">`).join("")}<link rel="stylesheet" href="/__admin_map.css"></head><body><div id="map-qa"></div><script src="/__admin_map.js"></script></body></html>` }));
    await page.goto("/__admin_map.html");
    const map = page.getByRole("region", { name: "Live dispatch map" });
    await expect(page.getByRole("status")).toContainText("without street details");
    await expect(map.locator(".leaflet-marker-icon")).toHaveCount(2);
    expect(await map.evaluate(el => getComputedStyle(el).position)).toBe("relative");
    expect(await map.locator("..").evaluate(el => getComputedStyle(el).isolation)).toBe("isolate");
    await expect.poll(() => map.locator("img.leaflet-tile").evaluateAll(images => images.length > 0 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(cdnRequests).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const zoom of await map.locator(".leaflet-control-zoom a").all()) {
      const box = await zoom.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    failed = false;
    await page.getByRole("button", { name: "Retry map" }).click();
    await expect(map.locator(".leaflet-marker-icon")).toHaveCount(2);
    await expect(page.getByText(/without street details/)).toHaveCount(0);
    await expect.poll(() => map.locator("img.leaflet-tile").evaluateAll(images => images.some(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.evaluate(() => { const map = document.querySelector('[aria-label="Live dispatch map"]')!; window.scrollTo({ top: window.scrollY + map.getBoundingClientRect().top + 20, behavior: "instant" }); });
    await expect.poll(() => map.evaluate(el => el.getBoundingClientRect().top)).toBeLessThanOrEqual(-19);
    const bell = page.getByRole("button", { name: "Notifications", exact: true });
    const box = await bell.boundingBox();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"), { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 })).toBe("Notifications");
    await page.screenshot({ path: info.outputPath("map-scroll-containment.png") });
    await bell.click(); await expect(page.getByText("Notifications opened", { exact: true })).toBeVisible();
  });
}
