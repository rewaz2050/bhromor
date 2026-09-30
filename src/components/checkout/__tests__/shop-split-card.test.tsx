/**
 * C2 (2026-09-28) — the card that turns a mixed bag into named parcels.
 *
 * A buyer who discovers a second delivery charge at the door feels cheated;
 * a buyer who reads it here simply decides. So the card's job is disclosure,
 * and what it must never do is blur two parcels into one tidy total.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ShopSplitCard, { type ShopParcel } from "@/components/checkout/shop-split-card";

afterEach(cleanup);

const parcel = (over: Partial<ShopParcel> = {}): ShopParcel => ({
  shopId: "shop-a",
  shopName: "সিতারা",
  qty: 2,
  subtotal: 120000,
  delivery: 6000,
  freeDelivery: false,
  discount: 0,
  promo: 0,
  total: 126000,
  ...over,
});

describe("ShopSplitCard (C2)", () => {
  it("says plainly how many orders the tap becomes", () => {
    render(
      <ShopSplitCard
        parcels={[parcel(), parcel({ shopId: "shop-b", shopName: "রঙধনু", total: 56000 })]}
      />,
    );
    expect(screen.getByTestId("shop-split")).toHaveTextContent("২টি দোকান · ২টি অর্ডার");
    expect(screen.getByTestId("shop-split")).toHaveTextContent("প্রতিটি দোকান নিজের পার্সেল প্যাক করে");
  });

  it("names each shop, its pieces and its own delivery", () => {
    render(
      <ShopSplitCard
        parcels={[
          parcel(),
          parcel({ shopId: "shop-b", shopName: "রঙধনু", subtotal: 50000, delivery: 6000, total: 56000 }),
        ]}
      />,
    );
    const first = screen.getByTestId("parcel-shop-a");
    expect(first).toHaveTextContent("সিতারা");
    expect(first).toHaveTextContent("২টি পণ্য");
    expect(first).toHaveTextContent("ডেলিভারি ৳60");
    expect(screen.getByTestId("parcel-total-shop-a")).toHaveTextContent("৳1,260");
    expect(screen.getByTestId("parcel-total-shop-b")).toHaveTextContent("৳560");
  });

  it("shows who paid for a free ride, and the money off when a code applied", () => {
    render(
      <ShopSplitCard
        parcels={[
          parcel({ freeDelivery: true, freeBy: "shop", delivery: 0, discount: 5000, promo: 3000 }),
          parcel({ shopId: "shop-b", shopName: "রঙধনু", delivery: 6000 }),
        ]}
      />,
    );
    expect(screen.getByTestId("parcel-shop-a")).toHaveTextContent("ফ্রি ডেলিভারি (দোকানের অফার)");
    expect(screen.getByTestId("parcel-shop-a")).toHaveTextContent("কুপন −৳50");
    expect(screen.getByTestId("parcel-shop-a")).toHaveTextContent("অফার −৳30");
  });

  it("says where the basket's one tip and one gift wrap went", () => {
    render(
      <ShopSplitCard
        parcels={[
          parcel({ carries: "both" }),
          parcel({ shopId: "shop-b", shopName: "রঙধনু", carries: null }),
        ]}
      />,
    );
    expect(screen.getByTestId("parcel-shop-a")).toHaveTextContent("টিপ ও গিফট র‍্যাপ এই পার্সেলে");
    expect(screen.getByTestId("parcel-shop-b")).not.toHaveTextContent("টিপ");
  });

  it("names a shop that is away on holiday, with the day it is back", () => {
    render(
      <ShopSplitCard
        parcels={[
          parcel(),
          parcel({
            shopId: "shop-b",
            shopName: "রঙধনু",
            closed: "On holiday — back 13 Oct",
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("parcel-closed-shop-b")).toHaveTextContent("back 13 Oct");
  });

  it("says nothing at all for an ordinary one-shop bag", () => {
    const { container } = render(<ShopSplitCard parcels={[parcel()]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
