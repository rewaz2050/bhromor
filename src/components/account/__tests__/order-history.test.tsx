/**
 * UX audit 2026-09-18, P1 #15 — the account finally lists the orders that
 * earned the stamps, and the login tab answers "forgot password?" honestly
 * (the shop's own WhatsApp — there is no OTP by design).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccountView from "../account-view";
import { __resetLiveAuthForTests } from "@/lib/customer-session";

const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });
type Handler = (url: string, init?: RequestInit) => Promise<Response>;
let routes: Record<string, Handler>;
const originalFetch = globalThis.fetch;

const customer = { id: "c1", name: "রহিম উদ্দিন", phone: "01712345678" };

beforeEach(() => {
  __resetLiveAuthForTests();
  routes = {
    "/api/contact": async () => jsonResponse({ phone: "01700000000", whatsapp: "01700000000" }),
  };
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

describe("Account — order history (P1 #15)", () => {
  it("lists the orders on the account phone with status, slot, total and a Track link", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer });
    routes["/api/account/orders"] = async () =>
      jsonResponse({
        phone: customer.phone,
        orders: [
          {
            id: "PS-20260918-0007",
            createdAt: Date.UTC(2026, 8, 18, 6, 30),
            status: "confirmed",
            total: 156000,
            itemCount: 2,
            firstItem: "Cotton Panjabi",
            payment: "bkash",
            paymentStatus: "pending_verification",
            scheduledAt: Date.UTC(2026, 8, 18, 12, 0),
            deliveryWindow: "evening",
            isPickup: false,
            isReturn: false,
          },
          {
            id: "PS-20260901-0002",
            createdAt: Date.UTC(2026, 8, 1, 6, 30),
            status: "cancelled",
            total: 45000,
            itemCount: 1,
            firstItem: "Silk Scarf",
            payment: "cod",
            paymentStatus: null,
            scheduledAt: null,
            deliveryWindow: null,
            isPickup: false,
            isReturn: false,
          },
        ],
      });
    render(<AccountView />);
    const history = await screen.findByTestId("order-history");
    await waitFor(() => expect(history.textContent).toContain("PS-20260918-0007"));
    expect(history.textContent).toContain("Cotton Panjabi");
    expect(history.textContent).toMatch(/2 items/);
    expect(history.textContent).toMatch(/bKash · verifying/);
    // Slot text is the same summary admin/rider print.
    expect(history.textContent).toMatch(/Evening \(6–9 PM\)/);
    expect(history.textContent).toContain("Cancelled");
    const links = screen.getAllByRole("link", { name: /^Track/ });
    expect(links[0].getAttribute("href")).toBe("/track?id=PS-20260918-0007&phone=01712345678");
    // Called once, with cookies — no phone in the URL for the history list.
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("/api/account/orders"),
    );
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).not.toContain("phone=");
  });

  it("empty history points to the shop; a failed load offers a retry", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer });
    let attempt = 0;
    routes["/api/account/orders"] = async () => {
      attempt += 1;
      return attempt === 1 ? jsonResponse({ error: "boom" }, 500) : jsonResponse({ orders: [] });
    };
    render(<AccountView />);
    const history = await screen.findByTestId("order-history");
    await waitFor(() => expect(history.textContent).toMatch(/Could not load your orders/));
    fireEvent.click(screen.getByRole("button", { name: "↻" }));
    await waitFor(() => expect(history.textContent).toMatch(/No orders on this number yet/));
    expect(screen.getByRole("link", { name: /Shop/ })).toHaveAttribute("href", "/shop");
  });

  it("names the shop each order came from (2026-10-11)", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer });
    routes["/api/account/orders"] = async () =>
      jsonResponse({
        phone: customer.phone,
        orders: [
          {
            id: "PS-1",
            createdAt: Date.UTC(2026, 9, 11, 6, 30),
            status: "confirmed",
            total: 90000,
            itemCount: 1,
            firstItem: "Cotton Panjabi",
            payment: "cod",
            paymentStatus: null,
            scheduledAt: null,
            deliveryWindow: null,
            isPickup: false,
            isReturn: false,
            shopId: "s2",
            shopName: "Rafiq Store",
          },
          {
            // Older API shape — no shop fields at all. The row still renders.
            id: "PS-0",
            createdAt: Date.UTC(2026, 8, 1, 6, 30),
            status: "delivered",
            total: 40000,
            itemCount: 1,
            firstItem: "Silk Scarf",
            payment: "cod",
            paymentStatus: null,
            scheduledAt: null,
            deliveryWindow: null,
            isPickup: false,
            isReturn: false,
          },
        ],
      });
    render(<AccountView />);
    const history = await screen.findByTestId("order-history");
    await waitFor(() => expect(history.textContent).toContain("PS-1"));
    expect(history.textContent).toContain("Rafiq Store");
    // A confirmed order is still moving, so it appears twice by design: once
    // in the "on its way" strip and once in the full list.
    expect(screen.getByTestId("active-orders").textContent).toContain("Rafiq Store");
    // The delivered one is not in the strip.
    expect(screen.getByTestId("active-orders").textContent).not.toContain("Silk Scarf");
  });
});

/** A row good enough to fill a page. */
const row = (id: string, status: string, shop: string | null = "Rafiq Store") => ({
  id,
  createdAt: Date.UTC(2026, 9, 11, 6, 30),
  status,
  total: 90000,
  itemCount: 1,
  firstItem: `Item ${id}`,
  payment: "cod",
  paymentStatus: null,
  scheduledAt: null,
  deliveryWindow: null,
  isPickup: false,
  isReturn: false,
  shopId: shop ? "s1" : null,
  shopName: shop,
});

describe("Account — the moving orders get their own strip (2026-10-11)", () => {
  /**
   * The 30 s tick itself is covered where it can be driven — use-live-refresh
   * under fake timers, and the tracker end to end. What matters here is the
   * shopper-visible half: an order that is still moving is pulled to the top,
   * and it leaves the strip once it has landed.
   */
  it("lifts a moving order to the top and drops it once delivered", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer });
    const served = "confirmed";
    routes["/api/account/orders"] = async () =>
      jsonResponse({
        orders: [
          row("PS-LIVE", served, "Rafiq Store"),
          row("PS-OLD", "delivered", "Rafiq Store"),
        ],
      });
    render(<AccountView />);
    const strip = await screen.findByTestId("active-orders");
    expect(strip.textContent).toContain("PS-LIVE");
    expect(strip.textContent).toContain("Rafiq Store");
    // The finished order stays in the list but out of the strip.
    expect(strip.textContent).not.toContain("PS-OLD");
    expect(screen.getByTestId("order-history").textContent).toContain("PS-OLD");
    // The strip says why it exists, so nobody mistakes it for a stuck page.
    expect(strip.textContent).toMatch(/refreshes itself/);
  });

  it("shows no strip at all when nothing is moving", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer });
    routes["/api/account/orders"] = async () =>
      jsonResponse({ orders: [row("PS-OLD", "delivered", null), row("PS-X", "cancelled", null)] });
    render(<AccountView />);
    const history = await screen.findByTestId("order-history");
    await waitFor(() => expect(history.textContent).toContain("PS-OLD"));
    expect(screen.queryByTestId("active-orders")).toBeNull();
  });
});

describe("Account — forgot password (P1 #15)", () => {
  it("the login tab explains the reset path and links the shop's WhatsApp with the typed number", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer: null }, 401);
    render(<AccountView />);
    await screen.findByRole("tab", { name: "Sign in" });
    // Signup tab: no forgot-password row.
    expect(screen.queryByTestId("forgot-password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Sign in" }));
    const details = await screen.findByTestId("forgot-password");
    expect(details.textContent).toMatch(/Forgot your password\?/);
    expect(details.textContent).toMatch(/no OTP on this site/);
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "01712345678" } });
    const wa = await screen.findByRole("link", { name: /WhatsApp 01700000000/ });
    expect(wa.getAttribute("href")).toContain("https://wa.me/8801700000000");
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("01712345678");
  });
});
