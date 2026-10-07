/**
 * The handover photo — shown when the rider took one, absent (not
 * placeholder) when they did not.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { makePlacedOrder, type Order } from "@/lib/orders";
import DeliveryProof from "../delivery-proof";

const PROOF = "https://res.cloudinary.com/prosanti/image/upload/prosanti/delivery-proofs/abc.jpg";

const base: Order = {
  ...makePlacedOrder({
    id: "PS-42",
    createdAt: Date.now() - 60 * 60_000,
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
  status: "delivered",
  timeline: [{ status: "delivered", at: Date.now() - 10 * 60_000 }],
};

const renderProof = (order: Order) =>
  render(
    <LanguageProvider initialLang="en">
      <DeliveryProof order={order} />
    </LanguageProvider>,
  );

afterEach(cleanup);

describe("DeliveryProof", () => {
  it("shows the rider's photo on a delivered order", () => {
    const { container } = renderProof({ ...base, deliveryProofUrl: PROOF });
    const section = screen.getByLabelText(/Handed over — proof photo/i);
    expect(section).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("res.cloudinary.com");
  });

  it("renders nothing when the rider took no photo", () => {
    const { container } = renderProof(base);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before delivery — no spoiler, no placeholder", () => {
    const { container } = renderProof({
      ...base,
      status: "out-for-delivery",
      deliveryProofUrl: PROOF,
    });
    expect(container).toBeEmptyDOMElement();
  });
});
