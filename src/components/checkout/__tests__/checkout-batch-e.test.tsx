/**
 * UX audit 2026-09-18, Batch E (P0 #1–#7) — the behaviours a shopper feels:
 *   • no "Nothing to check out" flash while the catalog is still loading
 *   • the outside-Sadar minimum is said BEFORE the tap and the button waits
 *   • the evening slot posts a real `scheduled_at` (today 18:00 Dhaka)
 *   • the receipt links to /track with id + phone and remembers the order
 *   • a raw English server error is shown in Bangla, in a role=alert, and
 *     the offending field is marked
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { DHAKA_OFFSET_MS } from "@/lib/delivery-slots";
import { LAST_ORDER_KEY } from "@/lib/last-order";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const fetchCalls: { url: string; body?: unknown }[] = [];
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

let orderResponse: () => Response = () =>
  jsonResponse({
    order: {
      id: "PS-20260918-0007",
      createdAt: Date.now(),
      customer: { name: "Test Customer", phone: "01712345678", area: "Boropara" },
      zoneId: "z1",
      zoneName: "Zone A — City Centre",
      etaLabel: "40–50 min",
      items: [],
      subtotal: 149000,
      deliveryCharge: 6000,
      total: 155000,
      payment: "cod",
      status: "pending",
      timeline: [{ status: "pending", at: Date.now() }],
      deliveryCode: "1234",
      deliveryWindow: "evening",
      scheduledAt: Date.UTC(2026, 8, 18, 12),
    },
  });

/** Holds the catalog answer until released — the P0 #7 race, on demand. */
let releaseCatalog: (() => void) | null = null;
let holdCatalog = false;

const mockFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  fetchCalls.push({ url, body: init?.body });
  if (url.includes("/api/orders")) return Promise.resolve(orderResponse());
  if (url.includes("/api/products")) {
    const answer = () =>
      jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] });
    if (holdCatalog) {
      return new Promise<Response>((resolve) => {
        releaseCatalog = () => resolve(answer());
      });
    }
    return Promise.resolve(answer());
  }
  if (url.includes("/api/zones")) {
    return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  }
  return Promise.resolve(jsonResponse({}));
};

const mount = () =>
  render(
    createElement(
      LanguageProvider,
      null,
      createElement(CartProvider, null, createElement(CheckoutView)),
    ),
  );

const seedCart = (qty = 1, productIndex = 0) => {
  const p = PRODUCTS[productIndex];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty }]),
  );
};

const fillStepOne = (phone = "01712345678") => {
  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), { target: { value: "Test Customer" } });
  fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText("পাড়া বা গ্রামের নাম"), { target: { value: "Boropara" } });
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 12, College Road, Mosque-এর পাশে" },
  });
};

beforeEach(() => {
  window.localStorage.clear();
  fetchCalls.length = 0;
  holdCatalog = false;
  releaseCatalog = null;
  vi.stubGlobal("fetch", mockFetch);
  seedCart();
});

describe("P0 #7 — no empty-cart flash before the catalog hydrates", () => {
  it("shows a skeleton while the stored bag waits for /api/products, then the form", async () => {
    holdCatalog = true;
    mount();
    // Lines are in storage, rows are in flight → skeleton, never "Nothing to check out".
    await waitFor(() => expect(screen.getByTestId("bag-skeleton")).toBeInTheDocument());
    expect(screen.queryByText(/Nothing to check out/i)).not.toBeInTheDocument();
    releaseCatalog?.();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("bag-skeleton")).not.toBeInTheDocument();
  });

  it("an actually empty bag shows the empty state once storage is read (no catalog wait)", async () => {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    holdCatalog = true;
    mount();
    await waitFor(() => expect(screen.getByText(/Nothing to check out/i)).toBeInTheDocument());
  });
});

describe("P0 #1 — three steps, one form", () => {
  it("renders the progress rail, the three step sections and the 'More options' accordion inside ONE form", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    const form = screen.getByRole("button", { name: /Place Order/i }).closest("form")!;
    expect(within(form).getByTestId("checkout-progress")).toBeInTheDocument();
    expect(form.querySelector("#checkout-step-1")).toBeTruthy();
    expect(form.querySelector("#checkout-step-2")).toBeTruthy();
    expect(form.querySelector("#checkout-step-3")).toBeTruthy();
    // Extras stay mounted (same form) even while collapsed.
    const more = within(form).getByTestId("more-options") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(within(more).getByPlaceholderText("Coupon code")).toBeInTheDocument();
    expect(within(more).getByTestId("gift-step")).toBeInTheDocument();
    // Sticky bar exists, hidden until the real button scrolls away.
    expect(within(form).getByTestId("sticky-order-bar")).toHaveAttribute("data-visible", "false");
    // One delivery promise sentence — the same one the bag shows.
    expect(screen.getByTestId("delivery-promise").textContent).toMatch(/৳60|৳৬০/);
  });
});

describe("P0 #3 — the outside-Sadar minimum is said before the tap", () => {
  it("disables Place Order and shows the shortfall for a ৳350 order to another district", async () => {
    // PRODUCTS[6] is the ৳350 line — under the ৳500 Zone D minimum.
    seedCart(1, 6);
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    const district = screen.getByDisplayValue(/Sunamganj$/) as HTMLSelectElement;
    fireEvent.change(district, { target: { value: "Sylhet" } });
    await waitFor(() => expect(screen.getByTestId("min-order-hint")).toBeInTheDocument());
    expect(screen.getByTestId("min-order-hint").textContent).toMatch(/৳150/);
    expect(screen.getByTestId("min-order-hint").textContent).toMatch(/৳500/);
    expect(screen.getByRole("button", { name: /Place Order/i })).toBeDisabled();
    // Back inside Sadar → no minimum, button live again.
    fireEvent.change(district, { target: { value: "Sunamganj" } });
    await waitFor(() => expect(screen.queryByTestId("min-order-hint")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Place Order/i })).not.toBeDisabled();
  });
});

describe("P0 #4 — the evening slot carries a real instant", () => {
  it("posts scheduled_at = today 18:00 Asia/Dhaka + delivery_window 'evening', and the receipt says so", async () => {
    // 11:15 Dhaka on 2026-09-18 → 05:15Z
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.UTC(2026, 8, 18, 5, 15) });
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    fillStepOne();
    fireEvent.click(screen.getByTestId("slot-evening"));
    expect(screen.getByTestId("evening-note")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));

    await waitFor(() => expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0), {
      timeout: 5000,
    });
    const call = fetchCalls.find((c) => c.url.includes("/api/orders"));
    const body = JSON.parse(String(call?.body)) as { scheduled_at?: string; delivery_window?: string };
    expect(body.delivery_window).toBe("evening");
    expect(body.scheduled_at).toBe(new Date(Date.UTC(2026, 8, 18, 18) - DHAKA_OFFSET_MS).toISOString());
    // Receipt prints the slot line the admin/rider will also see.
    expect(screen.getByTestId("receipt-slot").textContent).toMatch(/Evening|সন্ধ্যায়/);
  });
});

describe("P0 #5 — receipt → track without retyping", () => {
  it("links to /track?id=…&phone=…, offers a copy button, and remembers the order", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    fillStepOne("01712345678");
    fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
    await waitFor(() => expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0), {
      timeout: 5000,
    });
    const link = screen.getByTestId("receipt-track-link");
    expect(link.getAttribute("href")).toBe("/track?id=PS-20260918-0007&phone=01712345678");
    expect(screen.getByTestId("receipt-order-id").textContent).toBe("PS-20260918-0007");
    expect(screen.getByRole("button", { name: /Copy order ID/i })).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(LAST_ORDER_KEY) ?? "null") as {
      id: string;
      phone: string;
    } | null;
    expect(stored?.id).toBe("PS-20260918-0007");
    expect(stored?.phone).toBe("01712345678");
  });
});

describe("P0 #6 — errors in Bangla, on the field", () => {
  it("shows a role=alert in Bangla for a raw RPC stock error and marks the items row", async () => {
    orderResponse = () =>
      jsonResponse({ error: 'only 2 left of "Panjabi Classic"', field: "items" }, 409);
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    fillStepOne();
    fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());
    const alert = screen.getByTestId("order-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert.textContent).toMatch(/Panjabi Classic/);
    expect(alert.textContent).toMatch(/স্টকে আছে/);
    // English original kept under it for staff screenshots.
    expect(alert.textContent).toMatch(/only 2 left/);
    // The form is usable again.
    expect(screen.getByRole("button", { name: /Place Order/i })).not.toBeDisabled();
  });

  it("maps 422 field errors onto the inputs (aria-invalid) and says how many to fix", async () => {
    orderResponse = () =>
      jsonResponse(
        {
          error: "Please fix the highlighted fields.",
          errors: [
            { field: "phone", message: "A valid Bangladeshi mobile number is required (e.g. 017XXXXXXXX)." },
            { field: "address", message: "Please share a full delivery address (house/road/landmark)." },
          ],
        },
        422,
      );
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    fillStepOne();
    fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("017XXXXXXXX")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByPlaceholderText(/House 12/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("order-error").textContent).toMatch(/মোবাইল/);
    expect(screen.getByTestId("order-error").textContent).toMatch(/আরও 1টি/);
  });

  it("local validation: the empty form yields Bangla field hints, no request is sent", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
    await waitFor(() => expect(screen.getByTestId("order-error")).toBeInTheDocument());
    expect(fetchCalls.some((c) => c.url.includes("/api/orders"))).toBe(false);
    expect(screen.getByPlaceholderText("017XXXXXXXX")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/সঠিক মোবাইল নম্বর দিন/)).toBeInTheDocument();
  });
});
