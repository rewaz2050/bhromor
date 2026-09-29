/**
 * C3 (2026-09-29) — the admin shop file, as staff read it.
 *
 * The page's job is to answer "how is this shop doing?" without four tabs.
 * What is pinned here is the reading, not the markup: a shop with a blocked
 * problem must say so at the top, money must be labelled so nobody mistakes
 * takings for earnings, and a shop that does not exist must never look like a
 * shop with no orders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";

const state = vi.hoisted(() => ({
  detail: null as Record<string, unknown> | null,
  loading: false,
  missing: false,
  error: null as string | null,
  live: true,
}));

// The page reads the shop id from the route; there is no router in a unit test.
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "shop-1" }) }));

vi.mock("@/lib/use-admin-shop", () => ({
  useAdminShop: () => ({
    detail: state.detail,
    shop: (state.detail as { shop?: unknown } | null)?.shop ?? null,
    loading: state.loading,
    missing: state.missing,
    error: state.error,
    live: state.live,
    refresh: async () => true,
  }),
}));

import AdminShopDetailPage from "@/app/admin/shops/[id]/page";
import { LanguageProvider } from "@/components/i18n/language-provider";

afterEach(cleanup);

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-29T12:00:00.000Z");

const shop = (over: Record<string, unknown> = {}) => ({
  id: "shop-1",
  slug: "sitara",
  name: "সিতারা",
  phone: "01711111111",
  contactEmail: "owner@example.com",
  address: "Boropara",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active" as const,
  isOpen: true,
  ratingAvg: 4.2,
  ratingCount: 9,
  verification: { nid: true, tradeLicence: true, verifiedAt: NOW - 90 * DAY },
  ...over,
});

const file = (over: Record<string, unknown> = {}) => ({
  shop: shop(),
  staff: [{ userId: "u1", name: "Sitara owner", login: "owner@example.com", role: "owner", addedAt: NOW - 90 * DAY }],
  catalog: { total: 12, published: 10, drafts: 2, hidden: 0, outOfStock: 1, sample: [{ id: "p1", name: "Green panjabi", slug: "p1", price: 149000, status: "published", active: true, inStock: true }], windowFull: false },
  orders: {
    recent: [{ id: "o1", orderNo: "PS-1041", status: "delivered", total: 149000, at: NOW - 2 * DAY }],
    count: 42,
    delivered: 33,
    cancelled: 2,
    open: 3,
    revenue: 1_240_000,
    windowFull: false,
    window: 500,
  },
  ledger: {
    earned: 900_000,
    paid: 700_000,
    balance: 200_000,
    lastPayoutAt: NOW - 20 * DAY,
    lines: [],
    payouts: [{ id: "pay1", amount: 150_000, method: "bkash", reference: "TX9", at: NOW - 20 * DAY }],
  },
  commission: {
    current: 12.5,
    changes: 1,
    last: { id: "c2", shopId: "shop-1", fromPct: 15, toPct: 12.5, at: NOW - 40 * DAY, actorId: "staff-1", actorEmail: "nazmul@prosanti.example" },
    lines: [
      { id: "c1", shopId: "shop-1", fromPct: null, toPct: 15, at: NOW - 200 * DAY, actorId: null, actorEmail: null },
      { id: "c2", shopId: "shop-1", fromPct: 15, toPct: 12.5, at: NOW - 40 * DAY, actorId: "staff-1", actorEmail: "nazmul@prosanti.example" },
    ],
    available: true,
  },
  reviews: {
    count: 9,
    average: 4.2,
    public: 8,
    pending: 1,
    recent: [{ id: "r1", rating: 5, author: "Rahim", title: null, body: "খুব ভালো", status: "approved", reply: "ধন্যবাদ!", at: NOW - 5 * DAY }],
  },
  ...over,
});

const renderPage = () =>
  render(createElement(LanguageProvider, null, createElement(AdminShopDetailPage)));

beforeEach(() => {
  state.detail = file();
  state.loading = false;
  state.missing = false;
  state.error = null;
  state.live = true;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("admin shop file (C3)", () => {
  it("names the shop and links out to the storefront and its lists", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole("heading", { name: "সিতারা" })).toBeTruthy());
    expect(screen.getByText(/\/shops\/sitara/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Storefront/ })).toBeTruthy();
    // Twice on purpose: once in the header, once on the orders card.
    expect(screen.getAllByRole("link", { name: /All orders/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Payouts board/ })).toBeTruthy();
  });

  it("leads with the four numbers staff get asked for", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-headline")).toBeTruthy());
    const headline = screen.getByTestId("shop-headline");
    expect(headline).toHaveTextContent("42"); // orders
    expect(headline).toHaveTextContent("3"); // still open
    expect(headline).toHaveTextContent("৳12,400"); // what shoppers paid
    expect(headline).toHaveTextContent("★ 4.2");
  });

  it("separates what shoppers paid from what the shop earned", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-money")).toBeTruthy());
    const money = screen.getByTestId("shop-money");
    expect(money).toHaveTextContent("৳9,000"); // earned
    expect(money).toHaveTextContent("৳7,000"); // paid
    expect(money).toHaveTextContent("৳2,000"); // owed
    expect(screen.getByTestId("shop-headline")).toHaveTextContent("৳12,400"); // takings
  });

  it("shows the roster with the owner named first, and the shop's reply to a review", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-logins")).toBeTruthy());
    expect(screen.getByTestId("shop-logins")).toHaveTextContent("Sitara owner");
    expect(screen.getByTestId("shop-logins")).toHaveTextContent("owner");
    expect(screen.getByTestId("shop-reviews")).toHaveTextContent("ধন্যবাদ!");
  });

  it("puts a blocked problem at the top, above the numbers", async () => {
    state.detail = file({ shop: shop({ zoneIds: [] }) });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-flag-no-zone")).toBeTruthy());
    expect(screen.getByTestId("shop-flag-no-zone")).toHaveTextContent(/orders cannot arrive/i);
  });

  it("tells staff a holiday is coming, with the dates, instead of calling it closed", async () => {
    state.detail = file({ shop: shop({ vacation: { start: "2026-10-10", end: "2026-10-12" } }) });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-flag-on-holiday")).toBeTruthy());
    expect(screen.getByTestId("shop-flag-on-holiday")).toHaveTextContent(/10–12 Oct/);
  });

  it("says money has been sitting there for three weeks", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-flag-balance-due")).toBeTruthy());
    expect(screen.getByTestId("shop-flag-balance-due")).toHaveTextContent(/20 days ago/);
  });

  it("shows the commission as a trail, not as a bare number", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-commission")).toBeTruthy());
    const card = screen.getByTestId("shop-commission");
    expect(screen.getByTestId("commission-now")).toHaveTextContent("12.5%");
    // The join line has no "from", the move reads as an arrow.
    expect(card).toHaveTextContent("Started at 15%");
    expect(card).toHaveTextContent("15% → 12.5%");
    expect(card).toHaveTextContent("nazmul@prosanti.example");
    expect(screen.getByTestId("commission-summary")).toHaveTextContent("1 change");
  });

  it("says when the database stopped short of recording commission moves", async () => {
    const base = file();
    state.detail = {
      ...base,
      commission: { current: 15, changes: 0, last: null, lines: [], available: false },
    };
    renderPage();
    await waitFor(() => expect(screen.getByTestId("shop-commission")).toBeTruthy());
    expect(screen.getByTestId("shop-commission")).toHaveTextContent(/not being recorded/i);
  });

  it("says plainly when the shop is not on PROSANTI — never an empty file", async () => {
    state.detail = null;
    state.missing = true;
    renderPage();
    await waitFor(() => expect(screen.getByText(/not on prosanti/i)).toBeTruthy());
    expect(screen.queryByTestId("shop-headline")).toBeNull();
  });

  it("offers a retry when the read fails", async () => {
    state.detail = null;
    state.error = "Could not reach the shop data.";
    renderPage();
    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeTruthy());
  });
});
