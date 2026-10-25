import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const lang of ["en", "bn"] as const) {
  test(`customer access is usable at 320px: ${lang}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(lang => localStorage.setItem("prosanti-lang", lang), lang);
    await page.route("**/api/account/me", route => route.fulfill({ status: 401, json: { customer: null } }));
    await page.route("**/api/contact", route => route.fulfill({ json: { phone: null, whatsapp: null, email: null } }));
    let submissions = 0;
    await page.route("**/api/account/login", route => {
      submissions++;
      return route.fulfill({ status: 503, json: { error: lang === "en" ? "Sign-in is temporarily unavailable." : "লগইন এখন পাওয়া যাচ্ছে না।" } });
    });
    await page.goto("/account");
    const signup = page.getByRole("tab", { name: lang === "en" ? "New account" : "নতুন অ্যাকাউন্ট", exact: true });
    const login = page.getByRole("tab", { name: lang === "en" ? "Sign in" : "লগ ইন", exact: true });
    await expect(signup).toBeVisible();
    const password = () => page.getByLabel(lang === "en" ? "Password" : "পাসওয়ার্ড", { exact: true });
    await expect(password()).toHaveAttribute("minlength", "8");
    await signup.focus();
    await page.keyboard.press("ArrowRight");
    await expect(login).toBeFocused();
    await expect(login).toHaveAttribute("aria-selected", "true");
    await expect(password()).toHaveAttribute("minlength", "6");
    const phone = page.getByLabel(lang === "en" ? "Mobile number" : "মোবাইল নম্বর", { exact: true });
    await phone.fill("01712345678");
    await password().fill("qa-password");
    await page.getByRole("button", { name: lang === "en" ? "Show" : "দেখুন", exact: true }).click();
    await expect(password()).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: lang === "en" ? "Hide" : "লুকান", exact: true }).click();
    await expect(password()).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: lang === "en" ? "Sign in" : "লগ ইন করুন", exact: true }).click();
    const error = page.locator("main").getByRole("alert");
    await expect(error).toBeFocused();
    await expect(password()).toHaveValue("qa-password");
    expect(submissions).toBe(1);
    // Reset is an honest support handoff; no unconfigured WhatsApp is invented.
    const reset = page.getByTestId("forgot-password");
    await reset.locator("summary").click();
    await expect(reset.getByRole("link", { name: lang === "en" ? "Contact support" : "সাপোর্টে যোগাযোগ করুন", exact: true })).toHaveAttribute("href", "/contact");
    await page.addStyleTag({ content: ".below-fold-block { content-visibility: visible !important; }" });
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("account-login.png"), fullPage: true });
    await signup.click();
    const formTop = await page.locator("form").first().evaluate(el => el.getBoundingClientRect().top + scrollY);
    const pitchTop = await page.getByTestId("account-pitch").evaluate(el => el.getBoundingClientRect().top + scrollY);
    expect(formTop).toBeLessThan(pitchTop);
    await page.screenshot({ path: info.outputPath("account-signup.png"), fullPage: true });
  });
}

for (const kind of ["vendor", "rider"] as const) {
  test(`${kind} guest sign-in validates without submitting credentials`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/${kind}/login`);
    const signIn = page.getByRole("button", { name: kind === "vendor" ? "Sign in" : "লগইন করুন", exact: true });
    await signIn.click();
    const identifier = page.locator('input[autocomplete="username"]').first();
    await expect(identifier).toBeFocused();
    await expect(identifier).toHaveAttribute("aria-invalid", "true");
    await identifier.fill("qa@example.com");
    const password = page.locator('input[autocomplete="current-password"]');
    await password.fill("short");
    await signIn.click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: kind === "vendor" ? "Show" : "দেখুন", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(scan.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${kind}-login.png`), fullPage: true });
  });
}
