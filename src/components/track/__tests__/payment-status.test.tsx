import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PaymentStatus from "../payment-status";
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
  status: "pending",
  timeline: [],
};

describe("PaymentStatus strip (track page)", () => {
  it("renders nothing for COD orders", () => {
    const { container } = render(<PaymentStatus order={baseOrder} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'under verification' with the TRXID while the shop checks a wallet payment", () => {
    render(
      <PaymentStatus
        order={{
          ...baseOrder,
          payment: "bkash",
          paymentRef: "TRX98765",
          paymentStatus: "pending_verification",
        }}
      />,
    );
    expect(
      screen.getByText(/bKash payment — under verification/),
    ).toBeInTheDocument();
    expect(screen.getByText(/TRX98765/)).toBeInTheDocument();
  });

  it("shows verified once the shop confirms the money in its wallet", () => {
    render(
      <PaymentStatus
        order={{
          ...baseOrder,
          payment: "nagad",
          paymentStatus: "verified",
        }}
      />,
    );
    expect(screen.getByText(/Nagad payment verified/)).toBeInTheDocument();
    expect(screen.getByText(/order continues normally/)).toBeInTheDocument();
  });

  it("shows 'not accepted' when the shop rejected the payment", () => {
    render(
      <PaymentStatus
        order={{
          ...baseOrder,
          payment: "bkash",
          paymentStatus: "rejected",
        }}
      />,
    );
    expect(
      screen.getByText(/bKash payment not accepted/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/under verification/)).not.toBeInTheDocument();
  });

  it("a verified payment on a later-cancelled order says refund, not 'continues normally'", () => {
    render(
      <PaymentStatus
        order={{
          ...baseOrder,
          payment: "bkash",
          paymentStatus: "verified",
          status: "cancelled",
        }}
      />,
    );
    expect(screen.getByText(/bKash payment verified/)).toBeInTheDocument();
    expect(
      screen.getByText(/refund comes from the shop's wallet/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/continues normally/)).not.toBeInTheDocument();
  });

  it("a CANCELLED order never shows 'under verification' — legacy pending rows read as not accepted", () => {
    render(
      <PaymentStatus
        order={{
          ...baseOrder,
          payment: "nagad",
          paymentRef: "TRX11223",
          paymentStatus: "pending_verification",
          status: "cancelled",
        }}
      />,
    );
    expect(screen.queryByText(/under verification/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nagad payment not accepted/),
    ).toBeInTheDocument();
  });
});
