/**
 * Post-delivery review ask — the track page only asks once the order really
 * is delivered, and links straight to each bought piece's review form.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewAsk from "@/components/track/review-ask";
import { LanguageProvider } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";
import { __resetReviewProof, readReviewProof } from "@/lib/review-proof";
import { SETTINGS_DEFAULTS } from "@/lib/settings-store";

const settingsState = vi.hoisted(() => ({ loyaltyEnabled: true }));
vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({
    settings: { ...SETTINGS_DEFAULTS, loyaltyEnabled: settingsState.loyaltyEnabled },
    loading: false,
  }),
}));

const order = (over: Partial<Order>): Order =>
  ({
    id: "PS-20260921-0004",
    createdAt: 1_758_180_000_000,
    customer: { name: "Rahim", phone: "01711111111", area: "Boropara", address: "House 12" },
    items: [
      {
        productId: "p1",
        slug: "heritage-green-panjabi",
        name: "Heritage Green Panjabi",
        sku: "PAN-COT-GRN-M",
        variant: "M / Forest Green",
        qty: 1,
        unitPrice: 150000,
        image: "/images/products/panjabi.jpg",
      },
    ],
    zoneId: "z1",
    zoneName: "Sadar",
    etaLabel: "45-50 min",
    deliveryCharge: 6000,
    total: 156000,
    subtotal: 150000,
    payment: "cod",
    status: "confirmed",
    timeline: [{ status: "pending", at: 1_758_180_000_000 }],
    ...over,
  }) as Order;

const renderAsk = (o: Order) =>
  render(
    <LanguageProvider>
      <ReviewAsk order={o} />
    </LanguageProvider>,
  );

afterEach(() => {
  cleanup();
  __resetReviewProof();
  settingsState.loyaltyEnabled = true;
});

describe("ReviewAsk — delivered orders invite a one-line review", () => {
  it("renders nothing before the order is delivered", () => {
    const { container } = renderAsk(order({}));
    expect(container.querySelector('[data-testid="review-ask"]')).toBeNull();
  });

  it("links each bought piece's review form once delivered", () => {
    renderAsk(
      order({
        status: "delivered",
        timeline: [{ status: "delivered", at: 1_758_280_000_000 }],
      }),
    );
    expect(screen.getByTestId("review-ask")).toBeVisible();
    const link = screen.getByTestId("review-ask-link");
    expect(link).toHaveAttribute(
      "href",
      "/product/heritage-green-panjabi#reviews-heading",
    );
    expect(link).toHaveTextContent("Heritage Green Panjabi");
  });

  it("asks for at most three pieces and skips items without a slug", () => {
    renderAsk(
      order({
        status: "delivered",
        items: [
          { ...order({}).items[0]!, slug: "a-panjabi", name: "A" },
          { ...order({}).items[0]!, slug: "", name: "Ghost" },
          { ...order({}).items[0]!, slug: "b-lungi", name: "B" },
          { ...order({}).items[0]!, slug: "c-gamcha", name: "C" },
          { ...order({}).items[0]!, slug: "d-shirt", name: "D" },
        ],
      }),
    );
    expect(screen.getAllByTestId("review-ask-link")).toHaveLength(3);
    expect(screen.getByTestId("review-ask")).toHaveTextContent("A");
    expect(screen.queryByText("Ghost")).toBeNull();
  });

  it("hands the order proof to the review form and promises the stamp (R10)", () => {
    renderAsk(order({ status: "delivered" }));
    expect(screen.getByTestId("review-ask-stamp")).toHaveTextContent(/1 stamp to your Smart Card/);
    expect(readReviewProof("p1")).toBeNull();
    fireEvent.click(screen.getByTestId("review-ask-link"));
    expect(readReviewProof("p1")).toEqual({ orderId: "PS-20260921-0004", phone: "01711111111" });
    expect(readReviewProof("p2")).toBeNull();
  });

  it("stays quiet about stamps when the Smart Card is switched off", () => {
    settingsState.loyaltyEnabled = false;
    renderAsk(order({ status: "delivered" }));
    expect(screen.queryByTestId("review-ask-stamp")).toBeNull();
    expect(screen.getByTestId("review-ask-link")).toBeVisible();
  });
});
