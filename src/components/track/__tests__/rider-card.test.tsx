/**
 * The rider card (2026-10-11).
 *
 * The payload always carried the rider; the customer could only reach them
 * once the parcel was late. These pin the other way round: the card — name,
 * rating, call — appears the moment a rider is on the job, and the call goes
 * away once the handover has happened or nobody is coming.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { makePlacedOrder, type Order, type OrderStatus } from "@/lib/orders";
import RiderCard from "../rider-card";

const RIDER = { id: "r1", name: "Karim", phone: "01711111111", ratingAvg: 4.8, ratingCount: 37 };

const order = (status: OrderStatus, over: Partial<Order> = {}): Order => ({
  ...makePlacedOrder({
    id: "PS-42",
    createdAt: Date.now() - 20 * 60_000,
    customer: { name: "Rahat", phone: "01712345678", area: "Boropara" },
    zone: { id: "z1", name: "Zone A", etaLabel: "45–50 min", charge: 6000 },
    items: [
      {
        product: { id: "p1", slug: "panjabi", sku: "SKU-1", name: "Panjabi", price: 250000 },
        image: "/img.jpg",
        variant: "M",
        qty: 1,
      },
    ],
  }),
  status,
  rider: RIDER,
  ...over,
});

const renderCard = (o: Order, lang: "en" | "bn" = "en") =>
  render(
    <LanguageProvider initialLang={lang}>
      <RiderCard order={o} />
    </LanguageProvider>,
  );

afterEach(cleanup);

describe("RiderCard", () => {
  it("renders nothing while no rider is on the job", () => {
    const { container } = renderCard(order("confirmed", { rider: undefined }));
    expect(container).toBeEmptyDOMElement();
  });

  it("names the rider and offers the call while the parcel is moving", () => {
    renderCard(order("out-for-delivery"));
    const card = screen.getByTestId("rider-card");
    expect(card.textContent).toContain("Karim");
    // the rating is the customer's only read on who is coming
    expect(card.textContent).toMatch(/4\.8 from 37 ratings/);
    const call = screen.getByTestId("rider-card-call");
    expect(call.getAttribute("href")).toBe("tel:01711111111");
  });

  it("keeps the call available before the delay note ever fires", () => {
    // 2 minutes into a 45-minute promise: nothing is late, the call is there.
    renderCard(order("courier-assigned", { createdAt: Date.now() - 2 * 60_000 }));
    expect(screen.getByTestId("rider-card-call")).toBeTruthy();
  });

  it("says the rider is new instead of inventing a rating", () => {
    renderCard(order("out-for-delivery", { rider: { ...RIDER, ratingCount: 0, ratingAvg: 0 } }));
    expect(screen.getByTestId("rider-card").textContent).toMatch(/no ratings yet/);
  });

  it("drops the call once the parcel has landed — and says it was delivered", () => {
    renderCard(order("delivered"));
    expect(screen.getByTestId("rider-card").textContent).toMatch(/Delivered your order/);
    expect(screen.queryByTestId("rider-card-call")).toBeNull();
  });

  it("renders nothing for a cancelled or failed order — no dead number on screen", () => {
    const cancelled = renderCard(order("cancelled"));
    expect(cancelled.container).toBeEmptyDOMElement();
    cancelled.unmount();
    const failed = renderCard(order("out-for-delivery", { deliveryFailedAt: Date.now() }));
    expect(failed.container).toBeEmptyDOMElement();
  });

  it("writes the rating in Bengali digits for a Bengali reader", () => {
    renderCard(order("out-for-delivery"), "bn");
    expect(screen.getByTestId("rider-card").textContent).toMatch(/৪\.৮/);
  });
});
