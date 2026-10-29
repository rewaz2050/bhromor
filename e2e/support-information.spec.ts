import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// No support messages or real tracking credentials are sent by this suite.
for (const lang of ["en", "bn"] as const) {
  test(`support and policy pages at 320px: ${lang}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const route of ["/contact", "/track", "/privacy", "/terms"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      if (route === "/privacy" || route === "/terms") {
        const nav = page.getByRole("navigation", { name: lang === "bn" ? "এই পাতায়" : "On this page", exact: true });
        const links = nav.getByRole("link");
        expect(await links.count()).toBe(route === "/privacy" ? 6 : 7);
        // Every jump link resolves to an actual readable policy heading.
        for (const link of await links.all()) {
          const href = await link.getAttribute("href");
          await expect(page.locator(`h2${href}`)).toHaveCount(1);
        }
        await links.last().click();
        const heading = page.locator(`h2${await links.last().getAttribute("href")}`);
        await expect.poll(() => heading.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(844);
        expect(await heading.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(90);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`${route.slice(1)}.png`), fullPage: true });
      // Materialize off-screen footer before sampling its contrast.
      await page.addStyleTag({ content: ".below-fold-block { content-visibility: visible !important; }" });
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test("contact validates, retains a failed draft, then announces confirmed receipt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("prosanti-lang", "en"));
  let calls = 0;
  await page.route("**/api/contact", route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { phone: null, whatsapp: null, email: null } });
    calls++;
    return route.fulfill(calls === 1 ? { status: 503, json: { error: "Unavailable" } } : { json: { sent: true } });
  });
  await page.goto("/contact");
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await send.click();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  expect(calls).toBe(0);
  await name.fill("Browser QA");
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("01712345678");
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await message.fill("Test message for browser-only interception.");
  await send.click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Could not send");
  await expect(message).toHaveValue("Test message for browser-only interception.");
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "Message received" })).toBeVisible();
  expect(calls).toBe(2);
});

test("tracking not-found moves focus to the result and offers recovery", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("prosanti-lang", "en"));
  await page.route("**/api/track?**", route => route.fulfill({ status: 404, json: { error: "Not found" } }));
  await page.goto("/track");
  const id = page.getByRole("textbox", { name: "Order ID", exact: true });
  await id.fill("PS-20261020-TEST");
  await page.getByRole("textbox", { name: /Phone number/i }).fill("01712345678");
  await page.getByRole("button", { name: "Track order", exact: true }).click();
  const result = page.getByRole("region", { name: "Tracking result" });
  await expect(result).toBeFocused();
  await expect(result.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/contact");
  await result.getByRole("button", { name: "Check order details" }).click();
  await expect(id).toBeFocused();
  await expect(id).toHaveValue("PS-20261020-TEST");
});
