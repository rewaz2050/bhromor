import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveDeliveryMap } from "../live-delivery-map";
import type { Order } from "@/lib/orders";

const mockOrder: Order = {
  id: "PS-20260909-0042",
  createdAt: 1700000000000,
  customer: {
    name: "Rahim",
    phone: "01711111111",
    area: "Kandirpar",
    address: "Kandirpar, Comilla",
  },
  items: [
    {
      productId: "p1",
      slug: "p1",
      name: "Cotton Panjabi",
      sku: "PAN-COT-WHT-M",
      variant: "M / White",
      qty: 1,
      unitPrice: 150000,
      image: "/images/products/panjabi.webp",
    },
  ],
  zoneId: "zone-a",
  zoneName: "Zone A",
  etaLabel: "45-50 min",
  deliveryCharge: 6000,
  total: 156000,
  subtotal: 150000,
  payment: "cod",
  status: "out-for-delivery",
  timeline: [],
};

describe("LiveDeliveryMap Component", () => {
  it("renders the map, ETA, customer area, and 4-digit security PIN", () => {
    render(<LiveDeliveryMap order={mockOrder} />);

    expect(screen.getByTestId("live-delivery-map")).toBeInTheDocument();
    expect(screen.getByText(/Kandirpar/i)).toBeInTheDocument();
    expect(screen.getByText(/নিরাপদ ডেলিভারি কোড/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/কল দিন/i)).toBeInTheDocument();
  });
});
