/**
 * B1 (2026-09-28) — a published product reaches the shop's followers.
 *
 * The announcement must fire exactly once, on the moment a product becomes
 * publicly visible: a product SAVED as published, or a draft whose status
 * flips to published. Editing an already-published product sends nothing —
 * a shop that fixes a typo must not spam the people following it.
 *
 * The fan-out itself (who gets pushed, who lands on the call list) lives in
 * src/lib/db/__tests__/growth-shop-follows.test.ts; here we only prove the
 * write paths call it with the right arguments — and never block the save.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const announced = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("@/lib/db/growth", () => ({
  announceNewProductToFollowers: async (input: Record<string, unknown>) => {
    announced.push(input);
    return { followers: 1, marketing: 1, reached: ["01712345678"], waiting: [] };
  },
}));

import { createProduct, updateProduct } from "../admin";

type Row = Record<string, unknown>;
type Result = { data?: unknown; error?: unknown };

const productRow = (over: Row = {}): Row => ({
  id: "p1",
  shop_id: "shop-b",
  slug: "panjabi",
  name: "হাতে বোনা পাঞ্জাবি",
  name_bn: "",
  sku: "PS-PANJABI",
  category_id: "men",
  subcategory: "",
  short_description: "",
  description: "",
  details: [],
  price: 150000,
  compare_at_price: null,
  status: "draft",
  active: true,
  featured: false,
  is_new: false,
  in_stock: true,
  low_stock: false,
  ...over,
});

/**
 * Chainable fake — enough surface for create/save of a single product. The
 * table is a one-row store: an insert or update writes through, every read
 * sees what was written (that is how the post-save bundle read learns the
 * status the caller asked for).
 */
const dbFor = (row: Row = productRow()) => {
  let stored: Row = { ...row };
  let inserted = false;
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    let wanted = "";
    for (const m of ["in", "neq", "order", "limit", "or", "delete", "eq"]) {
      q[m] = () => q;
    }
    q.select = (cols?: string) => {
      wanted = cols ?? "";
      return q;
    };
    q.insert = (vals: Row) => {
      if (table === "products") {
        stored = { ...stored, ...vals };
        inserted = true;
      }
      return q;
    };
    q.update = (vals: Row) => {
      if (table === "products") stored = { ...stored, ...vals };
      return q;
    };
    const settle = (): Result => {
      if (table === "categories") return { data: [{ id: "men" }], error: null };
      if (table === "shops") return { data: { id: "shop-b" }, error: null };
      // `.insert(...).select("id").single()` answers the new id; the bundle
      // read that follows is a `select("*")` and answers the stored row.
      if (table === "products" && wanted === "id" && inserted) {
        return { data: { id: "p1" }, error: null };
      }
      if (table === "products") return { data: stored, error: null };
      return { data: [], error: null };
    };
    q.single = async () => settle();
    q.maybeSingle = async () => settle();
    q.then = (resolve: (v: Result) => unknown) => Promise.resolve(settle()).then(resolve);
    return q;
  };
  return { from } as never;
};

const input = (over: Row = {}) => ({
  name: "হাতে বোনা পাঞ্জাবি",
  slug: "hate-bona-panjabi",
  sku: "PS-PANJABI",
  category: "men",
  price: 150000,
  ...over,
});

beforeEach(() => {
  announced.length = 0;
});

describe("publishing a product announces it to followers (B1)", () => {
  it("announces a product saved straight as published", async () => {
    await createProduct(dbFor(), input({ status: "published" }), "shop-b");
    expect(announced).toEqual([
      {
        shopId: "shop-b",
        productName: "হাতে বোনা পাঞ্জাবি",
        productSlug: "hate-bona-panjabi",
        pricePaisa: 150000,
      },
    ]);
  });

  it("says nothing when the product is only a draft", async () => {
    await createProduct(dbFor(), input({ status: "draft" }), "shop-b");
    expect(announced).toEqual([]);
  });

  it("announces the draft → published transition, and only that one", async () => {
    await updateProduct(dbFor(productRow({ status: "draft" })), "p1", {
      status: "published",
    });
    expect(announced).toEqual([
      {
        shopId: "shop-b",
        productName: "হাতে বোনা পাঞ্জাবি",
        productSlug: "panjabi",
        pricePaisa: 150000,
      },
    ]);

    // A second save of an already-live product is an edit, not news.
    await updateProduct(dbFor(productRow({ status: "published" })), "p1", {
      status: "published",
    });
    expect(announced).toHaveLength(1);
  });

  it("never lets a broken announcement fail the save", async () => {
    announced.push = () => {
      throw new Error("push pipeline down");
    };
    await expect(
      createProduct(dbFor(), input({ status: "published" }), "shop-b"),
    ).resolves.toMatchObject({ id: "p1" });
  });
});
