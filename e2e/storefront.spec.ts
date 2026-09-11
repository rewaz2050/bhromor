import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function settled(page: Page) {
  await page.locator("header").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole("button", { name: "Search products", exact: true }),
  ).toBeEnabled();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function accessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`responsive layout and screenshots at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/", "/shop", "/product/heritage-green-panjabi"]) {
      await page.goto(route);
      await settled(page);
      await noOverflow(page);
      await expect(page.locator("h1")).toBeVisible();
      if (route === "/") {
        await expect(page.locator(".cinematic-hero")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Explore collection" }),
        ).toBeVisible();
      }
      await page.screenshot({
        path: info.outputPath(`${route.replaceAll("/", "_") || "home"}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    expect(errors).toEqual([]);
  });
}

test("mobile quick add → bag → checkout retains selected options", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/shop");
  await settled(page);
  await page
    .getByRole("button", { name: "Quick add Heritage Green Panjabi to cart" })
    .click();
  const options = page.getByRole("dialog", {
    name: "Select options for Heritage Green Panjabi",
  });
  await expect(
    options.getByRole("button", { name: "Select a size to continue" }),
  ).toBeDisabled();
  await options.getByRole("button", { name: "L", exact: true }).click();
  await options.getByRole("button", { name: "Increase quantity" }).click();
  await options.getByText("Size & fit guide", { exact: true }).click();
  await expect(
    options.getByText(/verified size-by-size measurement chart/),
  ).toBeVisible();
  await accessible(page);
  await options
    .getByRole("button", { name: "Add to Bag →", exact: true })
    .click();
  const bag = page.getByRole("dialog", { name: "Your Bag" });
  await expect(bag).toBeVisible();
  await expect(bag.getByText(/· L/)).toBeVisible();
  await expect(
    bag.getByRole("heading", { name: "Your Bag (2)" }),
  ).toBeVisible();
  await noOverflow(page);
  await accessible(page);
  await bag.getByRole("link", { name: "Checkout →" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByLabel(/Full name/)).toBeVisible();
  await page.getByLabel(/Full name/).fill("Browser QA");
  await page.getByLabel(/Mobile number/).fill("01712345678");
  // Simple form: district + upazila default to Sunamganj / Sunamganj Sadar —
  // pick a para from the selectable list.
  await page.getByLabel(/Para or Village/).selectOption("Boropara");
  await page
    .getByLabel(/Full address/)
    .fill("QA address, do not fulfil");
  await expect(
    page.getByRole("button", { name: "Place Order", exact: true }),
  ).toBeEnabled();
  await noOverflow(page);
  await accessible(page);
  // Do not submit an order: this suite is safe to run against a configured preview.
  await context.close();
});

test("search dialog traps focus, closes with Escape and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  await settled(page);
  const trigger = page.getByRole("button", {
    name: "Search products",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search the collection" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type="search"]')).toBeFocused();
  expect(
    await page.locator("header").evaluate((el) => (el as HTMLElement).inert),
  ).toBe(true);
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.locator("header").evaluate((el) => (el as HTMLElement).inert),
  ).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});

test("wishlist persists after reload; mobile filters apply and clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shop?mood=festive");
  await settled(page);
  const heart = page
    .getByRole("button", { name: "Add to wishlist", exact: true })
    .first();
  await expect(heart).toBeEnabled();
  await heart.click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Remove from wishlist", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  const filter = page.getByRole("dialog", { name: "Product filters" });
  await filter.getByLabel("Under ৳500", { exact: true }).check();
  await filter.getByRole("button", { name: "Show 0 products" }).click();
  await expect(
    page.getByRole("heading", { name: "No products found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear all filters" }).click();
  await expect(page.locator("article")).toHaveCount(7);
});

test("reduced motion disables entrance and feedback animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settled(page);
  expect(
    await page
      .locator("h1")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page
    .getByRole("button", { name: "Search products", exact: true })
    .click();
  expect(
    await page
      .locator(".drawer-panel")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { name: "Featured." })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Featured." }),
  ).toBeVisible();
});

for (const route of [
  "/",
  "/shop",
  "/product/heritage-green-panjabi",
  "/account",
  "/wishlist",
]) {
  test(`accessibility scan ${route}`, async ({ page }) => {
    await page.goto(route);
    await settled(page);
    await accessible(page);
  });
}
