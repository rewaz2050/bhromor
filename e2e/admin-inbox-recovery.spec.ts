import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
let script = "";
test.beforeAll(async () => {
  const hooks = path.resolve("e2e/fixtures/admin-inbox/state.ts");
  const alias: Record<string, string> = { "@": path.resolve("src"), "next/image": path.resolve("e2e/fixtures/gallery/image.tsx") };
  for (const name of ["use-notifications", "use-staff-live", "use-applications-pending", "use-orders", "use-catalog", "use-settings", "use-reviews"]) alias[`@/lib/${name}`] = hooks;
  const modules: Record<string, string> = {
    "next/link": 'import {createElement} from "react"; export default function Link({href,prefetch,replace,scroll,...props}) {return createElement("a",{...props,href});}',
    "next/navigation": 'export const usePathname=()=>"/admin/notifications"; export const useRouter=()=>({push:()=>{},replace:()=>{}});',
    "@/lib/env": 'export const isSupabaseConfigured=()=>false;',
    "@/lib/admin-auth": 'export const ADMIN_LOGIN_PATH="/admin/login"; export const getAdminAuthed=()=>true; export const subscribeAdminAuth=()=>()=>{}; export const refreshStaffSession=async()=>true; export const signOutAdmin=async()=>{};',
    "@/components/admin/push-setup": 'export default function PushSetup(){return null;}',
  };
  const result = await build({ entryPoints: [path.resolve("e2e/fixtures/admin-inbox/app.tsx")], bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias, plugins: [{ name: "isolated-inbox-fixtures", setup(build) {
    build.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/env|@\/lib\/admin-auth|@\/components\/admin\/push-setup)$/ }, args => ({ path: args.path, namespace: "qa" }));
    build.onLoad({ filter: /.*/, namespace: "qa" }, args => ({ contents: modules[args.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0].text;
});
for (const width of [320, 390, 1280]) {
  test(`honest session/inbox recovery and usable controls: ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/");
    const sheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
    await page.route("**/__inbox_qa.js", route => route.fulfill({ contentType: "application/javascript", body: script }));
    await page.route("**/__inbox_qa.html", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head>${sheets.map(href => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><div id="inbox-qa"></div><script src="/__inbox_qa.js"></script></body></html>` }));
    await page.goto("/__inbox_qa.html");
    const main = page.locator("main"); const header = page.locator("header");
    await expect(header.getByText("Checking session", { exact: true })).toBeVisible();
    await expect(main.getByRole("status")).toContainText("Loading your inbox");
    await expect(main.getByText("Nothing here", { exact: true })).toHaveCount(0);
    await page.evaluate(() => (window as typeof window & { adminInboxQA: { sessionFailure: () => void } }).adminInboxQA.sessionFailure());
    await expect(header.getByText("Session unavailable", { exact: true })).toBeVisible();
    await expect(main.getByText("Inbox could not be verified", { exact: true })).toBeVisible();
    await main.getByRole("alert").filter({ hasText: "Inbox:" }).getByRole("button", { name: "Retry", exact: true }).click();
    await expect(header.getByText("Session verified", { exact: true })).toBeVisible();
    await expect(main.getByText("Loading your inbox…", { exact: true })).toHaveCount(0);
    const unread = main.getByRole("button", { name: "Unread 0", exact: true }); await unread.click();
    await expect(main.getByText("All caught up", { exact: true })).toHaveCount(0);
    await main.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(main.getByText("Saved system notice", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Unread 2", exact: true })).toHaveAttribute("aria-pressed", "true");
    await main.getByRole("button", { name: "Mark all read", exact: true }).click();
    await expect(main.getByText("All caught up", { exact: true })).toBeVisible();
    await page.evaluate(() => (window as typeof window & { adminInboxQA: { updateFailure: () => void } }).adminInboxQA.updateFailure());
    await expect(main.getByText("All caught up", { exact: true })).toHaveCount(0);
    await main.getByRole("button", { name: "All 2", exact: true }).click();
    await expect(main.getByText("Saved system notice", { exact: true })).toBeVisible();
    await expect(main.getByRole("status")).toContainText("may not reflect the latest updates");
    for (const control of await main.getByRole("button").all()) {
      const rect = await control.boundingBox(); expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    for (const control of await header.locator("button, a").all()) {
      if (!await control.isVisible()) continue;
      const rect = await control.boundingBox(); expect(rect!.height).toBeGreaterThanOrEqual(44); expect(rect!.width).toBeGreaterThanOrEqual(44);
    }
    const scan = await new AxeBuilder({ page }).include("header").include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("inbox-recovery.png") });
  });
}
