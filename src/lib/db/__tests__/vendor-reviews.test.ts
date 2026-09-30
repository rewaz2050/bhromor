/**
 * B2 (2026-09-28) — the vendor reviews read + the reply write.
 *
 * The read belongs to the shop (its own approved reviews, with product names
 * and customer photos). The write is the one thing a shop may do to a review:
 * `saveVendorReply` trims, refuses an empty answer, stamps WHO wrote it, and
 * answers 404 when the row is not the shop's — never a silent no-op.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  reviews: [] as Record<string, unknown>[],
  products: [] as Record<string, unknown>[],
  photos: [] as { review_id: string; url: string }[],
  updates: [] as Record<string, unknown>[],
  updateFilters: [] as [string, string][],
  /** When set, the update answers this error (e.g. RLS hid the row). */
  updateError: null as { message: string } | null,
  updateReturnsRow: true,
  reviewReadError: null as { message: string } | null,
}));

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.eq = (col: string, val: unknown) => {
    state.updateFilters.push([col, String(val)]);
    return obj;
  };
  obj.in = () => obj;
  obj.order = () => obj;
  obj.limit = () => obj;
  obj.maybeSingle = () => obj;
  return obj;
};

const updateChain = (vals: Record<string, unknown>) => {
  // A one-row store: the update writes through (and the database, not the
  // client, sets the stamp — exactly like the guard trigger does).
  const stored = { ...state.reviews[0], ...vals, vendor_reply_at: "2026-09-28T06:00:00.000Z" };
  const obj: Record<string, unknown> = {};
  obj.eq = (col: string, val: unknown) => {
    state.updateFilters.push([col, String(val)]);
    return obj;
  };
  obj.select = () => obj;
  obj.maybeSingle = async () => {
    if (state.updateError) return { data: null, error: state.updateError };
    return state.updateReturnsRow
      ? { data: stored, error: null }
      : { data: null, error: null };
  };
  return obj;
};

const fakeDb = (): SupabaseClient =>
  ({
    from: (table: string) => {
      switch (table) {
        case "reviews":
          return {
            select: () =>
              state.reviewReadError
                ? chain(null, state.reviewReadError)
                : chain(state.reviews),
            update: (vals: Record<string, unknown>) => {
              state.updates.push(vals);
              return updateChain(vals);
            },
          };
        case "products":
          return { select: () => chain(state.products) };
        case "review_photos":
          return { select: () => chain(state.photos) };
        default:
          return { select: () => chain([]) };
      }
    },
  }) as unknown as SupabaseClient;

const { listVendorReviews, saveVendorReply } = await import("@/lib/db/vendor-reviews");

const row = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  shop_id: "s1",
  product_id: "p1",
  customer_id: null,
  author: "Rima",
  rating: 4,
  title: "Good",
  body: "Fabric is lovely, sleeve is short.",
  status: "approved",
  verified: true,
  featured: false,
  created_at: "2026-09-20T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  state.reviews = [row()];
  state.products = [{ id: "p1", name: "রঙিন পাঞ্জাবি", slug: "rongin-panjabi" }];
  state.photos = [{ review_id: "r1", url: "https://cdn.example/a.jpg" }];
  state.updates = [];
  state.updateFilters = [];
  state.updateError = null;
  state.updateReturnsRow = true;
  state.reviewReadError = null;
});

describe("listVendorReviews", () => {
  it("maps the shop's approved reviews with product and photos", async () => {
    const list = await listVendorReviews(fakeDb(), "s1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "r1",
      rating: 4,
      author: "Rima",
      productName: "রঙিন পাঞ্জাবি",
      productSlug: "rongin-panjabi",
      photos: ["https://cdn.example/a.jpg"],
      verified: true,
    });
    // Scoped to the shop AND to approved rows — a pending review is staff's.
    expect(state.updateFilters).toEqual(
      expect.arrayContaining([
        ["shop_id", "s1"],
        ["status", "approved"],
      ]),
    );
  });

  it("carries the shop's reply when one exists", async () => {
    state.reviews = [row({ vendor_reply: "Sleeve fixed — thank you!", vendor_reply_at: "2026-09-21T09:00:00.000Z", vendor_reply_by: "shop@example.com" })];
    const list = await listVendorReviews(fakeDb(), "s1");
    expect(list[0].vendorReply).toBe("Sleeve fixed — thank you!");
    expect(list[0].vendorReplyAt).toBe(Date.parse("2026-09-21T09:00:00.000Z"));
    expect(list[0].vendorReplyBy).toBe("shop@example.com");
  });

  it("reads an empty list instead of throwing when the table is unavailable", async () => {
    state.reviewReadError = { message: "missing" };
    expect(await listVendorReviews(fakeDb(), "s1")).toEqual([]);
    state.reviews = [];
    expect(await listVendorReviews(fakeDb(), "s1")).toEqual([]);
  });

  it("still lists the review when its product row is gone", async () => {
    state.products = [];
    const list = await listVendorReviews(fakeDb(), "s1");
    expect(list[0].productName).toBe("Product");
    expect(list[0].productSlug).toBe("");
  });
});

describe("saveVendorReply", () => {
  it("writes the trimmed reply with the account that wrote it", async () => {
    const saved = await saveVendorReply(fakeDb(), {
      id: "r1",
      shopId: "s1",
      reply: "  Sorry about the sleeve — we are remaking it this week.  ",
      by: "owner@shop.example",
    });
    expect(state.updates).toEqual([
      {
        vendor_reply: "Sorry about the sleeve — we are remaking it this week.",
        vendor_reply_by: "owner@shop.example",
      },
    ]);
    // The row is addressed by id AND shop (the product lookup that follows
    // shares the recorder, hence arrayContaining): RLS decides, the filter
    // agrees — a wrong-shop id can never be written.
    expect(state.updateFilters).toEqual(
      expect.arrayContaining([
        ["id", "r1"],
        ["shop_id", "s1"],
      ]),
    );
    expect(saved.id).toBe("r1");
    expect(saved.vendorReply).toBe(
      "Sorry about the sleeve — we are remaking it this week.",
    );
    // The stamp comes from the database's write, not from the request body.
    expect(saved.vendorReplyAt).toBe(Date.parse("2026-09-28T06:00:00.000Z"));
  });

  it("refuses an empty reply before touching the database", async () => {
    await expect(
      saveVendorReply(fakeDb(), { id: "r1", shopId: "s1", reply: "   " }),
    ).rejects.toMatchObject({ status: 422 });
    expect(state.updates).toEqual([]);
  });

  it("403/404s honestly when the review is not this shop's", async () => {
    state.updateReturnsRow = false;
    await expect(
      saveVendorReply(fakeDb(), { id: "r9", shopId: "s1", reply: "Thank you!" }),
    ).rejects.toMatchObject({ message: "That review is not available to your shop." });

    state.updateReturnsRow = true;
    state.updateError = { message: "permission denied" };
    await expect(
      saveVendorReply(fakeDb(), { id: "r1", shopId: "s1", reply: "Thank you!" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("leaves no stale author when the reply carries no email", async () => {
    await saveVendorReply(fakeDb(), { id: "r1", shopId: "s1", reply: "Thank you!" });
    expect(state.updates[0].vendor_reply_by).toBeNull();
  });
});
