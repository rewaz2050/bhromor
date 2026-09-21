/**
 * The account dashboard rebuild (2026-09-21): a hero that greets by name
 * with the membership chip and the last-order shortcut, and four lazy
 * programme tabs — Orders / Smart Card / Refer / PROSANTI+. Guests get the
 * auth form FIRST with the honest value pitch beside it, teasers below.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccountView from "../account-view";
import { __resetLiveAuthForTests } from "@/lib/customer-session";

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

let routes: Record<string, Handler>;
const originalFetch = globalThis.fetch;

const customer = { id: "c9", name: "রহিম সাহেব", phone: "01712345678" };

const signedInRoutes = () => {
  routes["/api/account/me"] = async () => jsonResponse({ customer });
  routes["/api/membership"] = async () =>
    jsonResponse({ state: "active", expiresAt: Date.now() + 86400000 });
  routes["/api/account/orders"] = async () => jsonResponse({ orders: [] });
  routes["/api/account/card"] = async () =>
    jsonResponse({ enabled: true, target: 10, stamps: 3, unlocked: false, revealed: true, cycles: 0, orderCount: 3, rewardTitle: "ফ্রি টি-শার্ট", rewardDescription: null });
  routes["/api/referral"] = async () =>
    jsonResponse({
      display: "RAHIM-50", code: "RAHIM", link: "https://x/r", path: "/r", paused: false,
      invited: 2, rewarded: 1, pending: 1, creditedPaisa: 5000, minOrderPaisa: 100000,
      friendRewardPaisa: 5000, referrerRewardPaisa: 5000, maxRewards: 10, coupons: [],
    });
};

beforeEach(() => {
  __resetLiveAuthForTests();
  routes = {};
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return jsonResponse({ error: "not mocked" }, 404);
    return routes[key](url, init);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("AccountView — the rebuilt dashboard", () => {
  it("greets by name, shows the PROSANTI+ chip, and defaults to the Orders tab", async () => {
    signedInRoutes();
    render(<AccountView />);

    const hero = await screen.findByTestId("account-hero");
    expect(hero).toHaveTextContent("রহিম সাহেব");
    expect(screen.getByTestId("account-hero-plus")).toHaveTextContent(/সক্রিয়|active/);

    // Orders is the landing tab — the history section is already mounted.
    await waitFor(() =>
      expect(screen.getByTestId("account-panel-orders")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("order-history")).toBeInTheDocument();
    // No programme duplicates on screen: exactly one tabpanel.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("mounts a programme only when its tab opens (Smart Card, then Refer)", async () => {
    signedInRoutes();
    render(<AccountView />);
    await screen.findByTestId("account-hero");

    fireEvent.click(screen.getByTestId("account-tab-card"));
    expect(await screen.findByTestId("loyalty-stamp-card")).toBeInTheDocument();
    expect(screen.queryByTestId("order-history")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("account-tab-refer"));
    expect(await screen.findByTestId("referral-card")).toBeInTheDocument();
    expect(screen.queryByTestId("loyalty-stamp-card")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("account-tab-plus"));
    await waitFor(() =>
      expect(screen.getByTestId("account-panel-plus")).toBeInTheDocument(),
    );
  });

  it("the last-order shortcut points at the tracker for the remembered order", async () => {
    signedInRoutes();
    window.localStorage.setItem(
      "prosanti.last-order.v1",
      JSON.stringify({ id: "PS-77", phone: "01712345678", placedAt: Date.now() }),
    );
    try {
      render(<AccountView />);
      const shortcut = await screen.findByTestId("account-hero-track");
      expect(shortcut).toHaveAttribute("href", "/track?id=PS-77");
    } finally {
      window.localStorage.removeItem("prosanti.last-order.v1");
    }
  });

  it("guests see the auth form first, the value pitch beside it, teasers below", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer: null }, 401);
    routes["/api/contact"] = async () => jsonResponse({ phone: "018000000000" });
    render(<AccountView />);

    await screen.findByRole("tab", { name: "নতুন অ্যাকাউন্ট" });
    // The form leads and the pitch is a sibling, not buried under teasers.
    expect(screen.getByLabelText("আপনার নাম")).toBeInTheDocument();
    expect(screen.getByTestId("account-pitch")).toHaveTextContent(/স্মার্ট কার্ড/);
    expect(screen.getByTestId("account-pitch")).toHaveTextContent(/PROSANTI\+/);
    // Programme teasers exist for guests, but the form card comes first in DOM.
    expect(screen.getByTestId("loyalty-stamp-card")).toBeInTheDocument();
    expect(screen.getByTestId("referral-card")).toBeInTheDocument();
    const form = screen.getByLabelText("আপনার নাম");
    const teasers = screen.getByTestId("referral-card");
    expect(form.compareDocumentPosition(teasers) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
