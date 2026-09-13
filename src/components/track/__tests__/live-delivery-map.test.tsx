import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveDeliveryMap } from "../live-delivery-map";
import type { Order } from "@/lib/orders";

const baseOrder: Order = {
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

const withRider: Order = {
  ...baseOrder,
  rider: {
    id: "r1",
    name: "করিম উদ্দিন",
    phone: "01812345678",
    ratingAvg: 4.8,
    ratingCount: 120,
  },
};

describe("LiveDeliveryMap Component", () => {
  it("renders the map, ETA, customer area, and 4-digit security PIN", () => {
    render(<LiveDeliveryMap order={withRider} />);

    expect(screen.getByTestId("live-delivery-map")).toBeInTheDocument();
    expect(screen.getByText(/Kandirpar/i)).toBeInTheDocument();
    expect(screen.getByText(/নিরাপদ ডেলিভারি কোড/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড রাইডার/i)).toBeInTheDocument();
    // A real rider → name, rating and the call button are shown.
    expect(screen.getByText(/করিম উদ্দিন/i)).toBeInTheDocument();
    expect(screen.getByText(/রেটিং 4.8 ★/)).toBeInTheDocument();
    expect(screen.getByText(/কল দিন/i)).toBeInTheDocument();
    // A COD order says COD in the payment row.
    expect(screen.getByText(/ক্যাশ অন ডেলিভারি \(COD\)/)).toBeInTheDocument();
  });

  it("never invents a rider: no name, no call button, no rating without one", () => {
    render(<LiveDeliveryMap order={baseOrder} />);

    expect(screen.getByText(/অ্যাসাইন্ড রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/রাইডার খোঁজা হচ্ছে…/)).toBeInTheDocument();
    expect(screen.queryByText(/কল দিন/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/রেটিং/)).not.toBeInTheDocument();
  });

  it("says what a wallet order actually pays in the payment row", () => {
    render(
      <LiveDeliveryMap order={{ ...baseOrder, payment: "bkash" }} />,
    );
    expect(screen.getByText(/bKash \(ওয়ালেট\)/)).toBeInTheDocument();
    expect(screen.queryByText(/ক্যাশ অন ডেলিভারি/)).not.toBeInTheDocument();
  });
});
