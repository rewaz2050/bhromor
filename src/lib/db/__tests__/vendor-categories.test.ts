/** C6 — vendor-owned subcategories under the platform's top-level list. */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  createVendorProductCategory,
  listVendorCategoryData,
} from "../vendor";

const CATEGORY = {
  id: "men",
  name: "Men",
  name_bn: "পুরুষ",
  tagline: "",
  image: "",
  subcategories: ["Panjabi"],
  sort_order: 1,
  active: true,
};

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };

const database = (opts: {
  custom?: Row[];
  duplicate?: boolean;
  inactiveParent?: boolean;
} = {}) => {
  const custom = [...(opts.custom ?? [])];
  const inserts: Row[] = [];
  let id = 0;
  const from = (table: string) => {
    let inserted: Row | null = null;
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) q[method] = () => q;
    q.insert = (row: Row) => {
      inserted = row;
      inserts.push(row);
      return q;
    };
    q.single = async (): Promise<Result> => {
      if (table === "categories") {
        return {
          data: { id: "men", active: !opts.inactiveParent },
          error: opts.inactiveParent ? { code: "PGRST116" } : null,
        };
      }
      if (opts.duplicate) return { data: null, error: { code: "23505" } };
      const row = inserted ?? {};
      const result = {
        id: `vc-${++id}`,
        category_id: row.category_id,
        name: row.name,
      };
      custom.push(result);
      return { data: result, error: null };
    };
    q.then = (resolve: (value: Result) => unknown) => {
      const data = table === "categories"
        ? [CATEGORY]
        : custom.map((row) => ({ id: row.id, category_id: row.category_id, name: row.name }));
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, inserts, custom };
};

describe("C6 vendor subcategories", () => {
  it("keeps platform top-levels and merges only this shop's custom names into suggestions", async () => {
    const { db } = database({
      custom: [
        { id: "a", category_id: "men", name: "Eid edit" },
        { id: "b", category_id: "women", name: "Festive" },
      ],
    });
    const result = await listVendorCategoryData(db, "shop-a");
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({
      id: "men",
      subCategories: ["Panjabi", "Eid edit"],
    });
    expect(result.vendorCategories).toEqual([
      { id: "a", categoryId: "men", name: "Eid edit" },
      { id: "b", categoryId: "women", name: "Festive" },
    ]);
  });

  it("adds a trimmed subcategory under a real platform category", async () => {
    const { db, inserts } = database();
    await expect(
      createVendorProductCategory(db, "shop-a", { categoryId: "men", name: "  Eid   Edit  " }),
    ).resolves.toEqual({ id: "vc-1", categoryId: "men", name: "Eid Edit" });
    expect(inserts).toEqual([{ shop_id: "shop-a", category_id: "men", name: "Eid Edit" }]);
  });

  it("rejects a missing parent or a bad-length name before insert", async () => {
    const { db: good, inserts } = database();
    await expect(
      createVendorProductCategory(good, "shop-a", { categoryId: "", name: "Eid" }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createVendorProductCategory(good, "shop-a", { categoryId: "men", name: "x" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(inserts).toEqual([]);
  });

  it("does not let a vendor create a child under a disabled platform category", async () => {
    const { db } = database({ inactiveParent: true });
    await expect(
      createVendorProductCategory(db, "shop-a", { categoryId: "men", name: "Eid Edit" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("maps same-shop duplicate names to a clear 409", async () => {
    const { db } = database({ duplicate: true });
    await expect(
      createVendorProductCategory(db, "shop-a", { categoryId: "men", name: "Eid Edit" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
