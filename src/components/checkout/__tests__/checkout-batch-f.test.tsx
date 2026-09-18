/**
 * UX audit 2026-09-18, Batch F (P1 #12 / #13 / #16 / #17) on the checkout:
 *   • bKash/Nagad: number + exact amount each get a copy button; the TRXID
 *     input is mono/uppercase and warns on an obviously short code
 *   • the applied coupon appears ONCE as a price line (no duplicate chip)
 *   • a saved address fills the form by itself on the next visit
 *   • another district shows a courier ETA in days, never "60–80 min"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { saveAddress, getSavedAddresses } from "@/lib/address-book";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

let wallets: { bkash?: string; nagad?: string } = {};
let couponAnswer: Record<string, unknown> | null = null;

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/products")) {
    return Promise.resolve(
      jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] }),
    );
  }
  if (url.includes("/api/zones")) {
    return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  }
  if (url.includes("/api/payments")) return Promise.resolve(jsonResponse(wallets));
  if (url.includes("/api/coupons/validate")) {
    return Promise.resolve(couponAnswer ? jsonResponse(couponAnswer) : jsonResponse({ reason: "nope" }, 404));
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

const ready = () =>
  waitFor(() => expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument());

beforeEach(() => {
  window.localStorage.clear();
  wallets = {};
  couponAnswer = null;
  vi.stubGlobal("fetch", mockFetch);
  seedCart();
});

describe("P1 #12 — bKash/Nagad block", () => {
  it("shows the number and the exact amount with copy buttons, and a TRXID hint", async () => {
    wallets = { bkash: "01712345678" };
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    mount();
    await ready();
    const bkash = await screen.findByRole("radio", { name: /bKash/ });
    fireEvent.click(bkash);
    const steps = await screen.findByTestId("wallet-steps");
    expect(within(steps).getByTestId("wallet-number").textContent).toBe("01712345678");
    // The amount is the order total the summary shows.
    const total = screen.getByTestId("summary-total").textContent ?? "";
    expect(within(steps).getByTestId("wallet-amount").textContent).toBe(total);
    fireEvent.click(within(steps).getByTestId("copy-wallet-number"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("01712345678"));
    fireEvent.click(within(steps).getByTestId("copy-wallet-amount"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    // Whole taka, digits only — pasteable into the bKash amount field.
    expect(String(writeText.mock.calls[1][0])).toMatch(/^\d+$/);
    // TRXID: uppercase, no spaces, short → hint.
    const input = within(steps).getByPlaceholderText("e.g. 9K2L7M4QXZ") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9k2 l" } });
    expect(input.value).toBe("9K2L");
    expect(within(steps).getByTestId("trxid-hint")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "9K2L7M4QXZ" } });
    expect(within(steps).queryByTestId("trxid-hint")).not.toBeInTheDocument();
  });
});

describe("P1 #13 — coupon shown once", () => {
  it("after applying, the code is one price line in the summary and one 'applied' row next to the input", async () => {
    couponAnswer = { valid: true, code: "EID10", discount: 10000, description: "Eid 10", freeDelivery: false };
    mount();
    await ready();
    const more = screen.getByTestId("more-options") as HTMLDetailsElement;
    const input = within(more).getByPlaceholderText("Coupon code");
    fireEvent.change(input, { target: { value: "eid10" } });
    fireEvent.click(within(more).getByRole("button", { name: /^Apply$/i }));
    await waitFor(() => expect(within(more).getByTestId("coupon-applied")).toBeInTheDocument(), {
      timeout: 3000,
    });
    // Exactly ONE "Remove" button on the whole page (used to be two).
    expect(screen.getAllByRole("button", { name: /^Remove$/i })).toHaveLength(1);
    // The summary prints the discount line once (desktop + mobile copies of the card are
    // both rendered, so count per card, not per page).
    const cards = screen.getAllByText(/^Your order$/i).map((h) => h.closest("div")!);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const lines = within(card).getAllByText(/EID10/);
      expect(lines).toHaveLength(1);
    }
  });
});

describe("P1 #16 — saved address pre-fills", () => {
  it("fills name, phone, house and para from the last saved address and says so", async () => {
    saveAddress({
      label: "🏠 Boropara - Rahim",
      name: "Rahim Uddin",
      phone: "01711111111",
      area: "Boropara",
      houseNo: "12",
      roadName: "College Road",
      fullAddress: "Beside the mosque",
      note: "",
      zoneId: "z1",
      tag: "home",
    });
    expect(getSavedAddresses()).toHaveLength(1);
    mount();
    await ready();
    await waitFor(() => expect(screen.getByTestId("address-prefilled")).toBeInTheDocument());
    expect((screen.getByPlaceholderText(/রাহাত আহমেদ/) as HTMLInputElement).value).toBe("Rahim Uddin");
    expect((screen.getByPlaceholderText("017XXXXXXXX") as HTMLInputElement).value).toBe("01711111111");
    expect((screen.getByLabelText("পাড়া বা গ্রামের নাম") as HTMLInputElement).value).toBe("Boropara");
    expect((screen.getByPlaceholderText(/House 12/) as HTMLInputElement).value).toBe("Beside the mosque");
  });

  it("saving the same place twice keeps one row", () => {
    const addr = {
      label: "🏠 Boropara - Rahim",
      name: "Rahim Uddin",
      phone: "01711111111",
      area: "Boropara",
      houseNo: "12",
      roadName: "College Road",
      fullAddress: "Beside the mosque",
      note: "",
      zoneId: "z1",
      tag: "home" as const,
    };
    saveAddress(addr);
    saveAddress({ ...addr, note: "call first" });
    expect(getSavedAddresses()).toHaveLength(1);
    expect(getSavedAddresses()[0].note).toBe("call first");
  });
});

describe("P1 #17 — other district = courier days, not minutes", () => {
  it("swaps the '60–80 min' ETA for a courier line when the district is not Sunamganj", async () => {
    seedCart(1, 0);
    mount();
    await ready();
    const district = screen.getByDisplayValue(/Sunamganj$/) as HTMLSelectElement;
    fireEvent.change(district, { target: { value: "Sylhet" } });
    await waitFor(() => expect(screen.getByTestId("courier-eta")).toBeInTheDocument());
    expect(screen.getByTestId("courier-eta").textContent).toMatch(/1–3 days|১–৩ দিন/);
    expect(document.body.textContent).not.toMatch(/60–80 min/);
  });
});
