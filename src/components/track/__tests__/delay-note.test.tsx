/**
 * The late note: minutes, a way to reach someone, and silence when there is
 * nothing to report.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { makePlacedOrder, type Order, type OrderStatus } from "@/lib/orders";
import DelayNote from "../delay-note";

const HOUR = 60 * 60_000;

const order = (status: OrderStatus, minutesAgo: number, over: Partial<Order> = {}): Order => ({
  ...makePlacedOrder({
    id: "PS-42",
    createdAt: Date.now() - minutesAgo * 60_000,
    customer: { name: "Rahat", phone: "01711111111", area: "Boropara" },
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
  ...over,
});

const renderNote = (o: Order, contact: string | null = null) =>
  render(
    <LanguageProvider initialLang="en">
      <DelayNote order={o} contactNumber={contact} />
    </LanguageProvider>,
  );

afterEach(cleanup);

describe("DelayNote", () => {
  it("says nothing while the order is still inside its promise", () => {
    const { container } = renderNote(order("preparing", 5));
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing once the parcel has landed", () => {
    const { container } = renderNote(order("delivered", 180));
    expect(container).toBeEmptyDOMElement();
  });

  it("names the delay in minutes and offers the rider", () => {
    renderNote(
      order("out-for-delivery", 180, {
        rider: { id: "r1", name: "Karim", phone: "01812345678", ratingAvg: 4.8, ratingCount: 40 },
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/min later than promised/i);
    const call = screen.getByRole("link", { name: /Call rider — Karim/i });
    expect(call).toHaveAttribute("href", "tel:01812345678");
  });

  it("offers WhatsApp when the shop has published a number", () => {
    renderNote(order("out-for-delivery", 180), "01711111111");
    const wa = screen.getByRole("link", { name: /WhatsApp/i });
    expect(wa.getAttribute("href")).toContain("https://wa.me/8801711111111");
    expect(wa.getAttribute("href")).toContain("PS-42");
  });

  it("offers nothing it cannot deliver: no rider, no number, no buttons", () => {
    renderNote(order("out-for-delivery", 180));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never cries late in the courier zone — no clock was ever promised", () => {
    const { container } = renderNote(order("out-for-delivery", 600, { zoneId: "z4" }));
    expect(container).toBeEmptyDOMElement();
  });
});
