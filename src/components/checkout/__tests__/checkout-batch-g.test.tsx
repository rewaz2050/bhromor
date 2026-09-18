/**
 * UX audit 2026-09-18, Batch G on the checkout (P2 #18 / #25):
 *   • the receipt ends with "what happens next" built from THIS order —
 *     COD says "pay at the door + PIN", bKash says "the shop matches your
 *     TRXID", a courier district says days not minutes
 *   • the phone input tidies pasted/+880/Bangla-digit numbers to the 11
 *     digits the placeholder promises, and autofill hints are set
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

let payment: "cod" | "bkash" = "cod";
let wallets: { bkash?: string } = {};

const orderResponse = () =>
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
      payment,
      paymentStatus: payment === "cod" ? undefined : "pending_verification",
      status: "pending",
      timeline: [{ status: "pending", at: Date.now() }],
      deliveryCode: "1234",
    },
  });

const mockFetch = (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/orders")) return Promise.resolve(orderResponse());
  if (url.includes("/api/products")) {
    return Promise.resolve(
      jsonResponse({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] }),
    );
  }
  if (url.includes("/api/zones")) {
    return Promise.resolve(jsonResponse({ source: "live", zones: DELIVERY_ZONES }));
  }
  if (url.includes("/api/payments")) return Promise.resolve(jsonResponse(wallets));
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

const seedCart = () => {
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 }]),
  );
};

const ready = () =>
  waitFor(() => expect(screen.getByRole("button", { name: /Place Order/i })).toBeInTheDocument());

const fillStepOne = (phone = "01712345678") => {
  fireEvent.change(screen.getByPlaceholderText(/রাহাত আহমেদ/), { target: { value: "Test Customer" } });
  fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText("পাড়া বা গ্রামের নাম"), { target: { value: "Boropara" } });
  fireEvent.change(screen.getByPlaceholderText(/House 12/), {
    target: { value: "House 12, College Road" },
  });
};

const placeAndWait = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
  await waitFor(() => expect(screen.getAllByText(/order confirmed/i).length).toBeGreaterThan(0), {
    timeout: 5000,
  });
};

beforeEach(() => {
  window.localStorage.clear();
  payment = "cod";
  wallets = {};
  vi.stubGlobal("fetch", mockFetch);
  seedCart();
});

describe("P2 #18 — receipt: what happens next", () => {
  it("COD, rider zone: confirm → picked up → pay at the door with the PIN", async () => {
    mount();
    await ready();
    fillStepOne();
    await placeAndWait();
    const next = screen.getByTestId("receipt-next-steps");
    const items = within(next).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toMatch(/Confirmed/);
    expect(items[0].textContent).toMatch(/checks stock and confirms/);
    expect(items[1].textContent).toMatch(/Picked up/);
    expect(items[1].textContent).toMatch(/rider/);
    expect(items[2].textContent).toMatch(/Delivered/);
    expect(items[2].textContent).toMatch(/Pay ৳1,550 at the door/);
    expect(items[2].textContent).toMatch(/4-digit PIN/);
    // The honest cancel window is stated once, at the end.
    expect(next.textContent).toMatch(/Cancel free on the track page until the shop packs it/);
  });

  it("bKash: the first step is the TRXID match and the last says 'already paid'", async () => {
    payment = "bkash";
    wallets = { bkash: "01712345678" };
    mount();
    await ready();
    fillStepOne();
    fireEvent.click(await screen.findByRole("radio", { name: /bKash/ }));
    const steps = await screen.findByTestId("wallet-steps");
    fireEvent.change(within(steps).getByPlaceholderText("e.g. 9K2L7M4QXZ"), {
      target: { value: "9K2L7M4QXZ" },
    });
    await placeAndWait();
    const next = screen.getByTestId("receipt-next-steps");
    const items = within(next).getAllByRole("listitem");
    expect(items[0].textContent).toMatch(/matches your bKash TRXID/);
    expect(items[items.length - 1].textContent).toMatch(/Already paid/);
    expect(next.textContent).not.toMatch(/Pay ৳/);
  });

  it("another district: the middle step is the courier in days, never minutes", async () => {
    mount();
    await ready();
    fillStepOne();
    fireEvent.change(screen.getByDisplayValue(/Sunamganj$/), { target: { value: "Sylhet" } });
    // Zone D minimum is ৳500 — PRODUCTS[0] clears it.
    await placeAndWait();
    const next = screen.getByTestId("receipt-next-steps");
    expect(next.textContent).toMatch(/Courier/);
    expect(next.textContent).toMatch(/1–3 days by courier/);
    expect(next.textContent).not.toMatch(/\d+–\d+ min/);
  });
});

describe("P2 #25 — phone input tidies itself", () => {
  it("drops +880 / spaces / dashes and Bangla digits down to 11 digits", async () => {
    mount();
    await ready();
    const phone = screen.getByPlaceholderText("017XXXXXXXX") as HTMLInputElement;
    fireEvent.change(phone, { target: { value: "+880 17-1234 5678" } });
    expect(phone.value).toBe("01712345678");
    fireEvent.change(phone, { target: { value: "০১৭১২৩৪৫৬৭৮" } });
    expect(phone.value).toBe("01712345678");
    // A 12th digit is ignored rather than producing an invalid number.
    fireEvent.change(phone, { target: { value: "017123456789" } });
    expect(phone.value).toBe("01712345678");
    // Autofill hints on the fields a browser can actually fill.
    expect(phone).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByPlaceholderText(/রাহাত আহমেদ/)).toHaveAttribute("autocomplete", "name");
    expect(screen.getByPlaceholderText(/House 12/)).toHaveAttribute("autocomplete", "street-address");
    expect(screen.getByDisplayValue(/Sunamganj$/)).toHaveAttribute("autocomplete", "address-level1");
  });
});
