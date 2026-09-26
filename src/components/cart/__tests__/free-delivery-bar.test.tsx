/**
 * Free-delivery threshold bar (2026-09-26): "add ৳X more" → "free", from the
 * SAME helpers the checkout and ps_place_order price with; nothing rendered
 * when neither the platform nor the shop armed a rule.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FreeDeliveryBar from "@/components/cart/free-delivery-bar";
import FreeDeliveryPill from "@/components/shop/free-delivery-pill";
import { SETTINGS_DEFAULTS, type AdminSettings } from "@/lib/settings-store";

const settingsRef: { current: AdminSettings } = { current: SETTINGS_DEFAULTS };
vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({ settings: settingsRef.current, loading: false }),
}));

const armed = (minSubtotalPaisa: number): AdminSettings => ({
  ...SETTINGS_DEFAULTS,
  freeDelivery: { enabled: true, minSubtotalPaisa },
});

afterEach(() => {
  cleanup();
  settingsRef.current = SETTINGS_DEFAULTS;
});

describe("FreeDeliveryBar", () => {
  it("renders nothing when no rule is armed — the bag looks exactly as before", () => {
    settingsRef.current = SETTINGS_DEFAULTS;
    const { container } = render(
      <FreeDeliveryBar shop={{ slug: "s", freeDeliveryMinPaisa: null }} subtotal={50_000} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("free-delivery-bar")).toBeNull();
  });

  it("platform rule: says how much is left, with a progress bar, and a keep-shopping link to the shop", () => {
    settingsRef.current = armed(100_000);
    render(<FreeDeliveryBar shop={{ slug: "shop-one", freeDeliveryMinPaisa: null }} subtotal={25_000} />);
    const bar = screen.getByTestId("free-delivery-bar");
    expect(bar).toHaveAttribute("data-reached", "false");
    expect(bar).toHaveTextContent("Add ৳750 more and delivery is free");
    const progress = screen.getByRole("progressbar", { name: /progress to free delivery/i });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("link", { name: /keep shopping/i })).toHaveAttribute("href", "/shops/shop-one");
    // scope is spelled out — rider areas only, never courier
    expect(bar).toHaveTextContent(/not on courier orders/i);
  });

  it("the shop's own (lower) minimum wins the target and is credited as the shop's offer once reached", () => {
    settingsRef.current = armed(150_000);
    const { rerender } = render(
      <FreeDeliveryBar shop={{ slug: "s", freeDeliveryMinPaisa: 80_000 }} subtotal={79_900} />,
    );
    expect(screen.getByTestId("free-delivery-bar")).toHaveTextContent("Add ৳1 more");
    rerender(<FreeDeliveryBar shop={{ slug: "s", freeDeliveryMinPaisa: 80_000 }} subtotal={80_000} />);
    const bar = screen.getByTestId("free-delivery-bar");
    expect(bar).toHaveAttribute("data-reached", "true");
    expect(bar).toHaveTextContent(/delivery is free on this order/i);
    expect(bar).toHaveTextContent(/shop offer/i);
    expect(screen.queryByRole("link", { name: /keep shopping/i })).toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("credits PROSANTI when its rule is the one met", () => {
    settingsRef.current = armed(50_000);
    render(<FreeDeliveryBar shop={{ slug: "s", freeDeliveryMinPaisa: 200_000 }} subtotal={60_000} />);
    expect(screen.getByTestId("free-delivery-bar")).toHaveTextContent(/PROSANTI offer/i);
  });
});

describe("FreeDeliveryPill", () => {
  it("is absent without a rule and names the lowest armed minimum with one", () => {
    settingsRef.current = SETTINGS_DEFAULTS;
    const { container, rerender } = render(<FreeDeliveryPill shop={{ freeDeliveryMinPaisa: null }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FreeDeliveryPill shop={{ freeDeliveryMinPaisa: 99_900 }} />);
    expect(screen.getByTestId("free-delivery-pill")).toHaveTextContent("Free delivery on orders over ৳999");
    settingsRef.current = armed(49_900);
    rerender(<FreeDeliveryPill shop={{ freeDeliveryMinPaisa: 99_900 }} />);
    expect(screen.getByTestId("free-delivery-pill")).toHaveTextContent("over ৳499");
  });
});
