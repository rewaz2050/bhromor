/**
 * C2 (2026-09-28) — POST /api/orders with a bag from several shops.
 *
 * The promise under test: one tap, one order per shop, and nothing half-done.
 * Concretely, each shop's order is validated on its own (its own stock, its
 * own courier floor, its own open/holiday state), the batch is placed as ONE
 * call so it is all-or-nothing, and what the basket has only one of — the tip,
 * the gift wrap, the referral — lands on one parcel instead of on each.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  serviceConfigured: true,
  snapshot: null as Record<string, unknown> | null,
  validateResults: [] as { ok: boolean; errors?: { field: string; message: string }[] }[],
  validateCalls: 0,
  payloads: [] as Record<string, unknown>[],
  placedOrders: null as { id: string; total: number; deliveryCharge: number }[] | null,
  placementError: null as Error | null,
  draftsSeen: 0,
}));

vi.mock("@/lib/env", () => ({ isServiceRoleConfigured: () => state.serviceConfigured }));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFromHeaders: () => "203.0.113.7",
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({ __fake: "service-client" }),
}));

vi.mock("@/lib/db/orders", () => ({
  OrderPlacementError: class OrderPlacementError extends Error {
    status: number;
    field: string;
    constructor(field: string, message: string, status = 422) {
      super(message);
      this.field = field;
      this.status = status;
    }
  },
  countStampsForPhone: async () => ({ orders: 0, reviews: 0, total: 0 }),
  loadOrderSnapshot: async () => state.snapshot,
  placeLiveOrder: async () => state.placedOrders?.[0] ?? null,
  placeLiveMultiOrder: async (drafts: unknown[]) => {
    if (state.placementError) throw state.placementError;
    state.draftsSeen = drafts.length;
    return state.placedOrders?.slice(0, drafts.length) ?? null;
  },
}));

vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async () => undefined,
  readOpsSettings: async () => ({}),
}));

vi.mock("@/lib/db/membership", () => ({ isPlusMember: async () => false }));

vi.mock("@/lib/customer-auth", () => ({
  resolveCustomer: async () => null,
  loadSmartCardTarget: async () => ({ target: 10 }),
}));

vi.mock("@/lib/order-validation", () => ({
  validateOrderPayload: (payload: unknown) => {
    state.validateCalls += 1;
    state.payloads.push((payload ?? {}) as Record<string, unknown>);
    const next = state.validateResults.shift() ?? { ok: true };
    return next.ok
      ? { ok: true as const, draft: { customer: { name: "রহিম", phone: "01712345678" } } }
      : { ok: false as const, errors: next.errors ?? [] };
  },
}));

import { POST } from "@/app/api/orders/route";

const shop = (id: string, name: string) => ({
  id,
  slug: id,
  name,
  tagline: "",
  logoUrl: "",
  coverUrl: "",
  phone: "01711111111",
  address: "",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active" as const,
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
});

const snapshotWith = (products: Record<string, unknown>[]) => ({
  products: products as never,
  zones: [] as never,
  coupons: [] as never,
  variants: [] as never,
  mediaByProduct: new Map(),
  shops: [shop("shop-a", "সিতারা"), shop("shop-b", "রঙধনু"), shop("shop-c", "মায়া"), shop("shop-d", "কিরণ")] as never,
  settings: undefined,
});

const product = (id: string, shopId: string, price = 100000) => ({
  id,
  slug: id,
  name: id,
  price,
  shopId,
  category: "panjabi",
});

const basePayload = (items: { productId: string; variantLabel?: string; qty?: number }[]) => ({
  name: "রহিম",
  phone: "01712345678",
  district: "সুনামগঞ্জ",
  upazila: "সুনামগঞ্জ সদর",
  para: "বড়পাড়া",
  address: "বড়পাড়া ১২",
  zoneId: "z1",
  tip_amount: 2000,
  weight_kg: 3,
  gift: { is_gift: true, gift_wrap: "box" },
  referral_code: "FRIEND1",
  items,
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.serviceConfigured = true;
  state.validateCalls = 0;
  state.validateResults = [];
  state.payloads = [];
  state.placementError = null;
  state.draftsSeen = 0;
  state.placedOrders = [
    { id: "PS-2001", total: 106000, deliveryCharge: 6000 },
    { id: "PS-2002", total: 53000, deliveryCharge: 6000 },
  ];
  state.snapshot = snapshotWith([
    product("p-a1", "shop-a"),
    product("p-a2", "shop-a", 50000),
    product("p-b1", "shop-b", 30000),
    product("p-c1", "shop-c"),
    product("p-d1", "shop-d"),
  ]);
});

describe("POST /api/orders — a bag from two shops", () => {
  it("validates each shop's order on its own, one payload each", async () => {
    const res = await post(
      basePayload([
        { productId: "p-a1", variantLabel: "L", qty: 1 },
        { productId: "p-a2", variantLabel: "M", qty: 2 },
        { productId: "p-b1", variantLabel: "S", qty: 1 },
      ]),
    );
    expect(res.status).toBe(201);
    expect(state.validateCalls).toBe(2);
    const first = state.payloads[0].items as { productId: string }[];
    const second = state.payloads[1].items as { productId: string }[];
    expect(first.map((i) => i.productId)).toEqual(["p-a1", "p-a2"]);
    expect(second.map((i) => i.productId)).toEqual(["p-b1"]);
  });

  it("places them as ONE batch, so a refused parcel leaves nothing behind", async () => {
    await post(
      basePayload([
        { productId: "p-a1", qty: 1 },
        { productId: "p-b1", qty: 1 },
      ]),
    );
    expect(state.draftsSeen).toBe(2);
  });

  it("answers with every order, and keeps `order` for older readers", async () => {
    const res = await post(
      basePayload([
        { productId: "p-a1", qty: 1 },
        { productId: "p-b1", qty: 1 },
      ]),
    );
    const body = (await res.json()) as { orders?: { id: string }[]; order?: { id: string } };
    expect(body.orders?.map((o) => o.id)).toEqual(["PS-2001", "PS-2002"]);
    expect(body.order?.id).toBe("PS-2001");
  });

  it("weighs each parcel on its own — one heavy parcel is not every parcel", async () => {
    await post(
      basePayload([
        { productId: "p-a1", qty: 1 },
        { productId: "p-a2", qty: 2 },
        { productId: "p-b1", qty: 1 },
      ]),
    );
    expect(state.payloads[0].weight_kg).toBe(1.5); // three units
    expect(state.payloads[1].weight_kg).toBe(0.5); // one unit
  });

  it("puts the basket's ONE tip, gift wrap and referral on the biggest parcel only", async () => {
    await post(
      basePayload([
        { productId: "p-b1", qty: 1 }, // ৳300 — the smaller parcel
        { productId: "p-a1", qty: 1 }, // ৳1000 — the primary
      ]),
    );
    const [small, big] = state.payloads;
    expect(small.tip_amount).toBeUndefined();
    expect(small.gift).toBeUndefined();
    expect(small.referral_code).toBeUndefined();
    expect(big.tip_amount).toBe(2000);
    expect(big.gift).toEqual({ is_gift: true, gift_wrap: "box" });
    expect(big.referral_code).toBe("FRIEND1");
  });

  it("says which shop refused, instead of a vague failure", async () => {
    state.validateResults = [
      { ok: true },
      { ok: false, errors: [{ field: "items", message: "“রঙধনু” is closed right now." }] },
    ];
    const res = await post(
      basePayload([
        { productId: "p-a1", qty: 1 },
        { productId: "p-b1", qty: 1 },
      ]),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors?: { message: string }[] };
    expect(body.errors?.[0]?.message).toMatch(/রঙধনু/);
    expect(state.draftsSeen).toBe(0); // nothing was sent to the database
  });

  it("caps how many shops one checkout can carry", async () => {
    const res = await post(
      basePayload([
        { productId: "p-a1", qty: 1 },
        { productId: "p-b1", qty: 1 },
        { productId: "p-c1", qty: 1 },
        { productId: "p-d1", qty: 1 },
      ]),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors?: { message: string }[] };
    expect(body.errors?.[0]?.message).toMatch(/৩টি দোকান/);
    expect(state.validateCalls).toBe(0);
  });

  it("leaves a one-shop bag exactly as it was — one validation, one order", async () => {
    const res = await post(
      basePayload([
        { productId: "p-a1", qty: 1 },
        { productId: "p-a2", qty: 1 },
      ]),
    );
    expect(res.status).toBe(201);
    expect(state.validateCalls).toBe(1);
    expect(state.payloads[0].tip_amount).toBe(2000);
    expect(state.payloads[0].referral_code).toBe("FRIEND1");
    const body = (await res.json()) as { orders?: unknown[] };
    expect(body.orders).toHaveLength(1);
  });
});
