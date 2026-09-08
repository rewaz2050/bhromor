import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTS } from "../catalog";
import {
  readAccountWishlist,
  removeAccountItems,
  saveAccountItems,
  wishlistIds,
  wishlistSlugs,
} from "../account-wishlist";

describe("Cloud wishlist adapter", () => {
  it("uses stable slugs and ignores products outside the catalogue", () => {
    expect(wishlistSlugs([PRODUCTS[0].id, PRODUCTS[0].id, "unknown"])).toEqual([
      PRODUCTS[0].slug,
    ]);
    expect(
      wishlistIds([
        { product_slug: PRODUCTS[0].slug },
        { product_slug: "unknown" },
      ]),
    ).toEqual([PRODUCTS[0].id]);
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
    expect(await readAccountWishlist(client, "owner-a")).toEqual([
      PRODUCTS[0].id,
    ]);
    expect(eq).toHaveBeenCalledWith("customer_id", "owner-a");
    eq.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(readAccountWishlist(client, "owner-a")).rejects.toThrow(
      "denied",
    );
  });
  it("imports as an additive conflict-safe upsert, not a destructive replace", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ upsert }) } as unknown as SupabaseClient;
    await saveAccountItems(client, "owner-a", [PRODUCTS[0].id]);
    expect(upsert).toHaveBeenCalledWith(
      [{ customer_id: "owner-a", product_slug: PRODUCTS[0].slug }],
      { onConflict: "customer_id,product_slug", ignoreDuplicates: true },
    );
  });
  it("always scopes deletion by owner and optionally the selected product", async () => {
    const query = {
      eq: vi.fn(),
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    query.eq.mockReturnValue(query);
    const client = {
      from: () => ({ delete: () => query }),
    } as unknown as SupabaseClient;
    await removeAccountItems(client, "owner-a", PRODUCTS[0].id);
    expect(query.eq.mock.calls).toEqual([
      ["customer_id", "owner-a"],
      ["product_slug", PRODUCTS[0].slug],
    ]);
    query.eq.mockClear();
    await removeAccountItems(client, "owner-a");
    expect(query.eq.mock.calls).toEqual([["customer_id", "owner-a"]]);
  });
});
