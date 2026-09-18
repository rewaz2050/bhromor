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
});

describe("Account — forgot password (P1 #15)", () => {
  it("the login tab explains the reset path and links the shop's WhatsApp with the typed number", async () => {
    routes["/api/account/me"] = async () => jsonResponse({ customer: null }, 401);
    render(<AccountView />);
    await screen.findByRole("tab", { name: "লগ ইন" });
    // Signup tab: no forgot-password row.
    expect(screen.queryByTestId("forgot-password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "লগ ইন" }));
    const details = await screen.findByTestId("forgot-password");
    expect(details.textContent).toMatch(/Forgot your password\?/);
    expect(details.textContent).toMatch(/no OTP on this site/);
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), { target: { value: "01712345678" } });
    const wa = await screen.findByRole("link", { name: /WhatsApp 01700000000/ });
    expect(wa.getAttribute("href")).toContain("https://wa.me/8801700000000");
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("01712345678");
  });
});
