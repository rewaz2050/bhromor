/**
 * A dropped pin used to stop at the pin: the picker computed the zone, showed
 * it as a badge, and threw the answer away — the shopper still had to type
 * their para out of 27 options while the map already knew which 8-9 were
 * possible. These assert the wire that closes that: click the map → the zone's
 * paras appear as one-tap chips → a tap fills the field and prices it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CheckoutView from "@/components/checkout/checkout-view";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, DELIVERY_ZONES, PRODUCTS } from "@/lib/catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { SUNAMGANJ_HUB_COORDS } from "@/lib/sunamganj";

const state = vi.hoisted(() => ({
  clickHandler: null as null | ((e: { latlng: { lat: number; lng: number } }) => void),
  markerLatLng: null as null | [number, number],
}));

vi.mock("leaflet", () => {
  const marker = {
    addTo: vi.fn(() => marker),
    bindPopup: vi.fn(() => marker),
    on: vi.fn(() => marker),
    setLatLng: vi.fn((ll: [number, number]) => {
      state.markerLatLng = ll;
    }),
    getLatLng: () => ({
      lat: state.markerLatLng?.[0] ?? 0,
      lng: state.markerLatLng?.[1] ?? 0,
    }),
  };
  const mapInstance = {
    on: vi.fn((event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void) => {
      if (event === "click") state.clickHandler = handler;
    }),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
    getZoom: () => 14,
    setView: vi.fn(),
  };
  return {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn((ll: [number, number]) => {
      state.markerLatLng = ll;
      return marker;
    }),
    circle: vi.fn(() => ({ addTo: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    Icon: { Default: { mergeOptions: vi.fn() } },
  };
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

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
  if (url.includes("/api/account/me")) {
    return Promise.resolve(jsonResponse({ customer: null }, 401));
  }
  return Promise.resolve(jsonResponse({}));
};

const renderCheckout = () =>
  render(
    <LanguageProvider initialLang="bn">
      <CartProvider>
        <CheckoutView />
      </CartProvider>
    </LanguageProvider>,
  );

beforeEach(() => {
  state.clickHandler = null;
  state.markerLatLng = null;
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.stubGlobal("fetch", mockFetch);
  const p = PRODUCTS[0];
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify([{ productId: p.id, variantLabel: `${p.colors[0]} · ${p.sizes[0]}`, qty: 1 }]),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("checkout — a pin narrows the para down to one tap", () => {
  it("turns a map click into tappable paras for that zone, and a tap prices it", async () => {
    renderCheckout();

    await waitFor(() => expect(screen.getByText("ম্যাপ দেখুন")).toBeTruthy());
    fireEvent.click(screen.getByText("ম্যাপ দেখুন"));

    // The picker imports Leaflet dynamically; wait for the map's click wire.
    await waitFor(() => expect(state.clickHandler).not.toBeNull());

    // ~250 m from Traffic Point → Zone A (Sadar city, 1.5 km ring).
    state.clickHandler?.({
      latlng: { lat: SUNAMGANJ_HUB_COORDS.lat + 0.002, lng: SUNAMGANJ_HUB_COORDS.lng + 0.001 },
    });

    const suggestions = await screen.findByTestId("pin-para-suggestions");
    expect(suggestions.textContent).toContain("Zone A");

    // Zone A's own list, not all 27 — and none from Zone C.
    expect(screen.getByRole("button", { name: "Boropara" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shologhar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wayesspur" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Boropara" }));

    const paraInput = screen.getByLabelText("পাড়া বা গ্রামের নাম") as HTMLInputElement;
    await waitFor(() => expect(paraInput.value).toBe("Boropara"));

    const quote = await screen.findByTestId("area-quote");
    expect(quote.getAttribute("data-zone")).toBe("z1");
  });

  it("keeps the typed para working when no pin was dropped", async () => {
    renderCheckout();
    await waitFor(() => expect(screen.getByLabelText("পাড়া বা গ্রামের নাম")).toBeTruthy());

    expect(screen.queryByTestId("pin-para-suggestions")).toBeNull();

    fireEvent.change(screen.getByLabelText("পাড়া বা গ্রামের নাম"), {
      target: { value: "Ukilpara" },
    });
    const quote = await screen.findByTestId("area-quote");
    expect(quote.getAttribute("data-zone")).toBe("z1");
  });
});
