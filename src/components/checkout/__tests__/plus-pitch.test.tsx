import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import OrderSummaryCard, { type PlusState, type PriceSummary } from "../order-summary-card";
import { DELIVERY_ZONES } from "@/lib/catalog";

vi.mock("@/components/promo/bag-offers", () => ({ default: () => null }));
vi.mock("@/components/cart/bag-shop-header", () => ({ default: () => null }));

const summaryFor = (charge: number): PriceSummary => ({
  charge,
  fullCharge: charge,
  freeDelivery: false,
  couponFree: false,
  plusFree: false,
  thresholdFree: null,
  discount: 0,
  promo: 0,
  promoKind: null,
  giftFee: 0,
  referral: 0,
  tip: 0,
  total: 50000 + charge,
  itemCount: 1,
  isOutside: false,
  breakdown: null,
  distanceKm: undefined,
  isNight: false,
  isRain: false,
});

const mount = (
  charge: number,
  opts: { lang?: "en" | "bn"; plusState?: PlusState; plusInfo?: { pricePaisa: number; enabled: boolean } | null; pickup?: boolean } = {},
) =>
  render(
    <LanguageProvider initialLang={opts.lang ?? "en"}>
      <CartProvider>
        <OrderSummaryCard
          compact={false}
          detail={[]}
          subtotal={50000}
          summary={summaryFor(charge)}
          zone={DELIVERY_ZONES[1]}
          isPickup={opts.pickup ?? false}
          activeCoupon={null}
          bagOffer={null}
          giftWrap=""
          plusState={opts.plusState ?? "none"}
          plusInfo={opts.plusInfo === undefined ? { pricePaisa: 9900, enabled: true } : opts.plusInfo}
          bagShopPrep={15}
        />
      </CartProvider>
    </LanguageProvider>,
  );

describe("PROSANTI+ pitch in the order summary (UX plan §8, R9)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "prosanti-lang=; max-age=0; path=/";
  });

  it("is loud with the exact saving when the charge is ৳100 or more (Bengali digits under bn)", () => {
    mount(15000, { lang: "bn" });
    const pitch = screen.getByTestId("plus-pitch");
    expect(pitch.dataset.strong).toBe("1");
    expect(pitch.textContent).toContain("৳১৫০");
    expect(pitch.textContent).toContain("৳৯৯");
    expect(pitch.querySelector("a")?.getAttribute("href")).toBe("/account#plus");
  });

  it("stays a quiet one-liner below ৳100 and uses the live price", () => {
    mount(6000, { plusInfo: { pricePaisa: 14900, enabled: true } });
    const pitch = screen.getByTestId("plus-pitch");
    expect(pitch.dataset.strong).toBeUndefined();
    expect(pitch.textContent).toContain("Not a member yet");
    expect(pitch.textContent).toContain("৳149");
  });

  it("is hidden when the shop has turned PROSANTI+ off, on pickup, or for members", () => {
    mount(15000, { plusInfo: { pricePaisa: 9900, enabled: false } });
    expect(screen.queryByTestId("plus-pitch")).toBeNull();
    mount(15000, { pickup: true });
    expect(screen.queryByTestId("plus-pitch")).toBeNull();
    mount(15000, { plusState: "active" });
    expect(screen.queryByTestId("plus-pitch")).toBeNull();
  });
});
