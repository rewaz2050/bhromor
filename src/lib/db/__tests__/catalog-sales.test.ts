/**
 * P2 #1 — the storefront catalog must carry the real sales figure from
 * v_product_sales (eligible units: non-cancelled orders minus refunded
 * returns). Products with no sales row simply have no figure — the UI then
 * shows no badge. A broken sales read must not kill the catalog.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  salesRows: [
    { product_id: "p1", units_sold: 5 },
  ] as { product_id: string; units_sold: number }[],
  salesError: null as { message: string } | null,
}));

const productRow = (id: string, name: string) => ({
  id,
  shop_id: "shop-1",
  slug: id,
  name,
  name_bn: "",
  sku: `SKU-${id}`,
  category_id: "men",
  subcategory: "Panjabi",
  short_description: "desc",
  description: "desc",
  details: [],
  price: 150000,
  compare_at_price: null,
  featured: false,
  is_new: false,
  in_stock: true,
  low_stock: false,
  status: "published",
  active: true,
  seo_title: null,
  seo_description: null,
});

const SHOP_ROW = {
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  tagline: "",
  logo_url: "",
  phone: "01700000000",
  contact_email: "",
  address: "",
  zone_ids: ["z1"],
  prep_minutes: 15,
  commission_pct: 15,
  status: "active",
  is_open: true,
  rating_avg: 0,
  rating_count: 0,
};

const table = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.order = () => obj;
  return { select: () => obj };
};

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: async () => ({
    from: (t: string) => {
      switch (t) {
        case "products":
          return table([productRow("p1", "One"), productRow("p2", "Two")]);
        case "v_product_sales":
          // PostgREST answers { data: null, error } on failure — mirror it.
          return table(state.salesError ? null : state.salesRows, state.salesError);
        case "shops":
          return table([SHOP_ROW]);
        case "categories":
          return table([
            {
              id: "men",
              name: "Men",
              name_bn: "",
              tagline: "",
              image: "",
              subcategories: [],
              sort_order: 0,
              active: true,
            },
          ]);
        case "delivery_zones":
          return table([
            {
              id: "z1",
              name: "Zone A",
              areas: [],
              charge: 6000,
              eta_label: "45-50 min",
              sort_order: 0,
              active: true,
            },
          ]);
        default:
          return table([]); // product_variants, product_media
      }
    },
  }),
}));

import { fetchLiveCatalog } from "../catalog";

describe("fetchLiveCatalog + v_product_sales (P2 #1)", () => {
  it("attaches the real units sold to products that have one", async () => {
    const live = await fetchLiveCatalog();
    expect(live).not.toBeNull();
    const byId = new Map((live as NonNullable<typeof live>).products.map((p) => [p.id, p]));
    expect(byId.get("p1")?.unitsSold).toBe(5);
    expect(byId.get("p2")?.unitsSold).toBeUndefined();
  });

  it("survives a sales-view hiccup — the catalog ships without the badge", async () => {
    state.salesError = { message: "permission denied" };
    const live = await fetchLiveCatalog();
    expect(live).not.toBeNull();
    const p1 = live!.products.find((p) => p.id === "p1");
    expect(p1?.unitsSold).toBeUndefined();
    state.salesError = null;
  });
});
