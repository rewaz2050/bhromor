/**
 * The shelf panel: what the counter sees while a parcel waits for a rider.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WaitingParcels from "../waiting-parcels";
import type { Order } from "@/lib/orders";

afterEach(cleanup);

const NOW = Date.parse("2026-10-07T12:00:00Z");

const parcel = (over: Partial<Order> = {}): Order => ({
  id: "PS-20261007-0003",
  createdAt: NOW - 40 * 60_000,
  customer: { name: "সালমা", phone: "01711111111", area: "হাসান নগর" },
  zoneId: "z1",
  zoneName: "Sadar",
  etaLabel: "45–60 min",
  items: [
    {
      productId: "p1",
      slug: "heritage-green-panjabi",
      name: "Panjabi",
      sku: "PS-MN-001",
      variant: "M",
      qty: 1,
      unitPrice: 120000,
      image: "",
    },
  ],
  subtotal: 120000,
  deliveryCharge: 6000,
  total: 126000,
  payment: "cod",
  status: "ready-for-pickup",
  timeline: [{ status: "ready-for-pickup", at: NOW - 12 * 60_000 }],
  ...over,
});

describe("WaitingParcels", () => {
  it("shows nothing at all when the shelf is empty", () => {
    render(<WaitingParcels orders={[parcel({ status: "delivered" })]} now={NOW} />);
    expect(screen.queryByTestId("waiting-parcels")).toBeNull();
  });

  it("says how long the parcel has been sitting there", () => {
    render(<WaitingParcels orders={[parcel()]} now={NOW} />);
    const row = screen.getByTestId("waiting-parcel-PS-20261007-0003");
    expect(row).toHaveTextContent("রাইডার পাওয়া যায়নি");
    expect(row).toHaveTextContent("হাসান নগর");
    expect(row).toHaveTextContent("১২ মিনিট");
  });

  it("offers no call button while there is nobody to call", () => {
    render(<WaitingParcels orders={[parcel()]} now={NOW} />);
    expect(screen.queryByTestId("waiting-parcel-call")).toBeNull();
  });

  it("names the rider and gives the counter a number the moment one accepts", () => {
    render(
      <WaitingParcels
        orders={[
          parcel({
            status: "courier-assigned",
            rider: { id: "r1", name: "রফিক", phone: "01712345678", ratingAvg: 4.8, ratingCount: 12 },
          }),
        ]}
        now={NOW}
      />,
    );
    const row = screen.getByTestId("waiting-parcel-PS-20261007-0003");
    expect(row).toHaveTextContent("রফিক");
    expect(screen.getByTestId("waiting-parcel-call")).toHaveAttribute(
      "href",
      "tel:01712345678",
    );
  });

  it("marks the long waits so they cannot be missed", () => {
    render(
      <WaitingParcels
        orders={[
          parcel({ timeline: [{ status: "ready-for-pickup", at: NOW - 40 * 60_000 }] }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("waiting-parcel-PS-20261007-0003")).toHaveTextContent(
      "কেউ নিতে আসেনি",
    );
  });

  it("links each parcel to its own order page", () => {
    render(<WaitingParcels orders={[parcel()]} now={NOW} />);
    expect(
      screen.getByRole("link", { name: "PS-20261007-0003" }),
    ).toHaveAttribute("href", "/vendor/orders/PS-20261007-0003");
  });
});
