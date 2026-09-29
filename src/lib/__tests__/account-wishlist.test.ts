import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../catalog";
import {
  readAccountWishlist,
  removeAccountItems,
  saveAccountItems,
  wishlistIds,
  wishlistSlugs,
  type SavedItemRow,
} from "../account-wishlist";
import type { Product } from "../catalog";

/** Two shops, one name — C5 lets both sell "cotton-panjabi". */
const pieceIn = (id: string, shopId: string): Product => ({
  ...(PRODUCTS[0] as Product),
  id,
  slug: "cotton-panjabi",
  shopId,
});

describe("Cloud wishlist adapter", () => {
  it("uses stable slugs and ignores products outside the catalogue", () => {
    expect(wishlistSlugs([PRODUCTS[0].id, PRODUCTS[0].id, "unknown"], PRODUCTS)).toEqual([
      PRODUCTS[0].slug,
    ]);
    expect(
      wishlistIds(
        [
          { product_slug: PRODUCTS[0].slug },
          { product_slug: "unknown" },
        ],
        PRODUCTS,
      ),
    ).toEqual([PRODUCTS[0].id]);
  });

  it("remembers the PIECE, so another shop's twin is not shown as saved", () => {
    const mine = pieceIn("p-mine", "shop-1");
    const twin = pieceIn("p-twin", "shop-2");
    const rows: SavedItemRow[] = [{ product_slug: "cotton-panjabi", product_id: "p-mine" }];
    expect(wishlistIds(rows, [mine, twin])).toEqual(["p-mine"]);
  });

  it("still resolves an older row that only remembers the name", () => {
    const mine = pieceIn("p-mine", "shop-1");
    expect(wishlistIds([{ product_slug: "cotton-panjabi" }], [mine])).toEqual(["p-mine"]);
  });

  it("drops a saved piece that left the catalog instead of opening another shop's namesake", () => {
    const twin = pieceIn("p-twin", "shop-2");
    expect(
      wishlistIds(
        [{ product_slug: "cotton-panjabi", product_id: "p-gone" }],
        [twin],
      ),
    ).toEqual([]);
  });
  it("scopes reads by customer and propagates remote errors", async () => {
    const eq = vi
      .fn()
      .mockResolvedValue({
        data: [{ product_slug: PRODUCTS[0].slug }],
        error: null,
      });
    const client = {
      from: vi.fn(() => ({ select: () => ({ eq }) })),
    } as unknown as SupabaseClient;
    expect(await readAccountWishlist(client, "owner-a", PRODUCTS)).toEqual([
      PRODUCTS[0].id,
    ]);
    expect(eq).toHaveBeenCalledWith("customer_id", "owner-a");
    eq.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(readAccountWishlist(client, "owner-a", PRODUCTS)).rejects.toThrow(
      "denied",
    );
  });
  it("imports as an additive conflict-safe upsert, not a destructive replace", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ upsert }) } as unknown as SupabaseClient;
    await saveAccountItems(client, "owner-a", [PRODUCTS[0].id], PRODUCTS);
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          customer_id: "owner-a",
          product_slug: PRODUCTS[0].slug,
          product_id: PRODUCTS[0].id,
        },
      ],
      { onConflict: "customer_id,product_id", ignoreDuplicates: true },
    );
  });
  it("always scopes deletion by owner and optionally the selected product", async () => {
    const query = {
      eq: vi.fn(),
      or: vi.fn(),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    query.eq.mockReturnValue(query);
    query.or.mockReturnValue(query);
    const client = {
      from: () => ({ delete: () => query }),
    } as unknown as SupabaseClient;

    await removeAccountItems(client, "owner-a", PRODUCTS[0].id, PRODUCTS);
    expect(query.eq.mock.calls).toEqual([["customer_id", "owner-a"]]);
    // One delete clears the new row (by piece) AND an older row that only
    // remembers the name.
    expect(query.or).toHaveBeenCalledWith(
      `product_id.eq.${PRODUCTS[0].id},product_slug.eq.${PRODUCTS[0].slug}`,
    );

    query.eq.mockClear();
    query.or.mockClear();
    await removeAccountItems(client, "owner-a", undefined, PRODUCTS);
    expect(query.eq.mock.calls).toEqual([["customer_id", "owner-a"]]);
    expect(query.or).not.toHaveBeenCalled();
  });

  it("refuses to delete a piece that is not in the catalogue", async () => {
    const query = { eq: vi.fn(), or: vi.fn() };
    const client = {
      from: () => ({ delete: () => query }),
    } as unknown as SupabaseClient;
    await expect(
      removeAccountItems(client, "owner-a", "unknown", PRODUCTS),
    ).rejects.toThrow("Unknown product");
  });
});
