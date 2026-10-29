import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CartProvider } from "@/components/cart/cart-provider";
import OrderSummaryCard, { type PriceSummary } from "../order-summary-card";
import { DELIVERY_ZONES } from "@/lib/catalog";

vi.mock("@/components/promo/bag-offers", () => ({ default: () => null }));
vi.mock("@/components/cart/bag-shop-header", () => ({ default: () => null }));

/**
 * The surcharge breakdown only renders when a surcharge applies — night
 * (9PM–6AM), rain, express or weight. That is why an invalid `<dl>` slipped
 * through: daytime runs never rendered the block, and the CI axe scan only
 * caught it once the clock crossed into night. These tests render it on
 * purpose, at any hour.
 */
const summary = (over: Partial<PriceSummary> = {}): PriceSummary => ({
  charge: 6000,
  fullCharge: 8000,
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
  total: 56000,
  itemCount: 1,
  isOutside: false,
  breakdown: {
    baseCharge: 6000,
    surcharge: { total: 2000, night: 1000, rain: 500, express: 300, weight: 200, tip: 0 },
    freeDelivery: false,
    couponFree: false,
    thresholdFree: null,
    isPickup: false,
    totalCharge: 8000,
    eta: "30–40 min",
    etaMinutes: 35,
  },
  distanceKm: 2,
  isNight: true,
  isRain: true,
  ...over,
});

const mount = (over: Partial<PriceSummary> = {}) =>
  render(
    <LanguageProvider initialLang="en">
      <CartProvider>
        <OrderSummaryCard
          compact={false}
          detail={[]}
          subtotal={50000}
          summary={summary(over)}
          zone={DELIVERY_ZONES[1]}
          isPickup={false}
          activeCoupon={null}
          bagOffer={null}
          giftWrap=""
          plusState="pending"
          plusInfo={{ pricePaisa: 9900, enabled: true }}
          bagShopPrep={15}
        />
      </CartProvider>
    </LanguageProvider>,
  );

/** Every direct <div> child of a <dl> must group at least one dt and one dd. */
const expectValidDefinitionList = (root: HTMLElement) => {
  for (const dl of Array.from(root.querySelectorAll("dl"))) {
    for (const child of Array.from(dl.children)) {
      if (child.tagName !== "DIV") continue;
      expect(child.querySelectorAll(":scope > dt").length, child.outerHTML).toBeGreaterThan(0);
      expect(child.querySelectorAll(":scope > dd").length, child.outerHTML).toBeGreaterThan(0);
      // A group must not wrap another row of spans — that is the shape axe
      // rejected ("dl element has direct children that are not allowed").
      expect(child.querySelector(":scope > div"), child.outerHTML).toBeNull();
    }
  }
};

describe("order summary definition list", () => {
  it("groups every surcharge row as dt/dd, not div>span", () => {
    const { container } = mount();
    expect(container.textContent).toContain("Night (9PM-6AM)");
    expect(container.textContent).toContain("Rain");
    expect(container.textContent).toContain("Express");
    expect(container.textContent).toContain("Weight");
    expectValidDefinitionList(container);
  });

  it("stays valid when only some surcharges apply", () => {
    const { container } = mount({
      breakdown: {
        baseCharge: 7000,
        surcharge: { total: 1000, night: 1000, rain: 0, express: 0, weight: 0, tip: 0 },
        freeDelivery: false,
        couponFree: false,
        thresholdFree: null,
        isPickup: false,
        totalCharge: 8000,
        eta: "30–40 min",
        etaMinutes: 35,
      },
    });
    expect(container.textContent).toContain("Night (9PM-6AM)");
    expect(container.textContent).not.toContain("🌧️");
    expectValidDefinitionList(container);
  });

  it("is valid in Bangla too", () => {
    const { container } = render(
      <LanguageProvider initialLang="bn">
        <CartProvider>
          <OrderSummaryCard
            compact
            detail={[]}
            subtotal={50000}
            summary={summary()}
            zone={DELIVERY_ZONES[1]}
            isPickup={false}
            activeCoupon={null}
            bagOffer={null}
            giftWrap=""
            plusState="pending"
            plusInfo={{ pricePaisa: 9900, enabled: true }}
            bagShopPrep={15}
          />
        </CartProvider>
      </LanguageProvider>,
    );
    expect(container.textContent).toContain("রাত");
    expectValidDefinitionList(container);
  });
});
