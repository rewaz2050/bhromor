/** Browser contracts for O01/O02/O11/O12. Real routes, components and hooks;
 * read APIs are fixtures. This is not authenticated Supabase acceptance. */
import { expect, test, type Page } from "@playwright/test";

const order = (id: string, name: string) => ({
  id,
  shopId: "verification-shop",
  createdAt: Date.now(),
  customer: {
    name,
    phone: "01711111111",
    area: "Town",
    address: "Fixture address",
  },
  zoneId: "zone-1",
  zoneName: "Town",
  items: [],
  subtotal: 10000,
  deliveryCharge: 0,
  total: 10000,
  status: "confirmed",
  payment: "cod",
  paymentStatus: "verified",
  timeline: [],
  etaLabel: "45 minutes",
});
const summary = {
  commissionIncome: 300000,
  deliveryIncome: 50000,
  tipsCollected: 0,
  tipsToRiders: 0,
  riderFeesEarned: 14000,
  deliveredOrders: 3,
  riderPayable: 14000,
  riderPayoutsPending: 0,
  riderPayoutsPendingCount: 0,
  riderPayoutsPaid: 0,
  shopPayable: 50000,
  codCustody: 220000,
  codClaimsPending: 0,
  activeRiders: 1,
  onlineRiders: 0,
  baseFee: 4000,
  codHandlingFee: 1000,
  minPayout: 1000,
};
const money = (commission = 300000) => ({
  ready: true,
  summary,
  settings: { baseFee: 4000, codHandlingFee: 1000, minPayout: 1000 },
  queue: { pending: [], decided: [] },
  pnl: {
    deliveredOrders: 3,
    returnLegs: 0,
    commission,
    deliveryIncome: 50000,
    shopFundedFreeDelivery: 0,
    riderFees: 14000,
    riderAdjustments: 0,
    discountsGiven: 0,
    shopFundedDiscounts: 0,
    tipsCollected: 0,
    tipsToRiders: 0,
  },
});
async function staffFixtures(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("prosanti.admin.session.v1", "1"),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data: Record<string, unknown> = {
      "/api/admin/me": { staff: true, role: "admin" },
      "/api/admin/orders": { orders: [] },
      "/api/admin/notifications": { notifications: [], unread: 0 },
      "/api/admin/riders": { riders: [] },
    };
    return route.fulfill({ json: data[path] ?? {} });
  });
}
async function noDocumentOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("orders first-read failure exposes Retry and recovers", async ({
      page,
    }) => {
      await staffFixtures(page);
      let unavailable = true;
      await page.route("**/api/admin/orders?**", (route) =>
        route.fulfill(
          unavailable
            ? { status: 503, json: { error: "Orders temporarily offline" } }
            : {
                json: { orders: [order("PS-RECOVERED", "Recovered customer")] },
              },
        ),
      );
      await page.goto("/admin/orders");
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Orders temporarily offline" });
      await expect(alert).toBeVisible();
      await expect(
        page.getByRole("status", { name: "Loading orders" }),
      ).toHaveCount(0);
      unavailable = false;
      await alert.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "PS-RECOVERED", exact: true }),
      ).toBeVisible();
      await expect(alert).toHaveCount(0);
      await noDocumentOverflow(page);
    });

    test("search retains focus while pending and ignores an older query response", async ({
      page,
    }) => {
      await staffFixtures(page);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/admin/orders?**", async (route) => {
        const q = new URL(route.request().url()).searchParams.get("q");
        if (q === "first") await gate;
        await route.fulfill({
          json: {
            orders:
              q === "second"
                ? [order("PS-SECOND", "Second customer")]
                : q === "first"
                  ? [order("PS-FIRST", "First customer")]
                  : [order("PS-BASE", "Base customer")],
          },
        });
      });
      try {
        await page.goto("/admin/orders");
        await expect(
          page.getByRole("link", { name: "PS-BASE", exact: true }),
        ).toBeVisible();
        const search = page.getByRole("searchbox", { name: "Search orders" });
        const firstRead = page.waitForRequest(
          (req) => new URL(req.url()).searchParams.get("q") === "first",
        );
        await search.fill("first");
        await firstRead;
        await expect(
          page.getByRole("status", { name: "Loading orders" }),
        ).toBeVisible();
        await expect(search).toBeFocused();
        await expect(search).toHaveValue("first");
        await search.fill("second");
        await expect(
          page.getByRole("link", { name: "PS-SECOND", exact: true }),
        ).toBeVisible();
        await expect(search).toBeFocused();
        const oldResponse = page.waitForResponse(
          (res) => new URL(res.url()).searchParams.get("q") === "first",
        );
        release();
        await oldResponse;
        // Give React a paint after processing the late response, not a fixed sleep.
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await expect(
          page.getByRole("link", { name: "PS-SECOND", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "PS-FIRST", exact: true }),
        ).toHaveCount(0);
        await expect(search).toHaveValue("second");
        await noDocumentOverflow(page);
      } finally {
        release();
      }
    });

    test("money network errors do not prescribe a migration and Retry recovers", async ({
      page,
    }) => {
      await staffFixtures(page);
      let unavailable = true;
      await page.route("**/api/admin/money?**", (route) =>
        route.fulfill(
          unavailable
            ? { status: 503, json: { error: "Money temporarily offline" } }
            : { json: money() },
        ),
      );
      await page.goto("/admin/money");
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Money temporarily offline" });
      await expect(alert).toBeVisible();
      await expect(
        page.getByText("Rider money backend is not installed yet", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("status", { name: "Loading money dashboard" }),
      ).toHaveCount(0);
      unavailable = false;
      await alert.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(page.getByTestId("pnl-commission")).toContainText("৳3,000");
      await expect(alert).toHaveCount(0);
      await noDocumentOverflow(page);
    });

    test("failed new period hides old totals, retains tabs and can retry", async ({
      page,
    }) => {
      await staffFixtures(page);
      let failSeven = true;
      await page.route("**/api/admin/money?**", (route) => {
        const seven =
          new URL(route.request().url()).searchParams.get("range") === "7d";
        return route.fulfill(
          seven && failSeven
            ? { status: 503, json: { error: "Seven-day read offline" } }
            : { json: money(seven ? 70000 : 300000) },
        );
      });
      await page.goto("/admin/money");
      await expect(page.getByTestId("pnl-commission")).toContainText("৳3,000");
      await page.getByRole("tab", { name: "7 days", exact: true }).click();
      const alert = page.getByRole("alert").filter({ hasText: "Money:" });
      await expect(alert).toContainText("Seven-day read offline");
      await expect(
        page.getByRole("tab", { name: "7 days", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("pnl-commission")).toHaveCount(0);
      await expect(page.getByTestId("pnl-missing")).toContainText(
        "could not be loaded for this period",
      );
      failSeven = false;
      await page
        .getByRole("button", { name: "Retry net result", exact: true })
        .click();
      await expect(page.getByTestId("pnl-commission")).toContainText("৳700");
      await expect(alert).toHaveCount(0);
      await expect(
        page.getByRole("tab", { name: "7 days", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await noDocumentOverflow(page);
    });
  });
}
