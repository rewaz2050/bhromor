/**
 * C3 (2026-09-29) — reading one shop's file.
 *
 * What this pins is the part that would embarrass us: a ledger that says the
 * shop earned more than it did, a balance that forgets a payout, revenue that
 * quietly counts cancelled orders, or a roster that hides the owner and shows
 * the assistant first. Every number here is money or access.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** Tables this database "does not have" — answers 42P01 like PostgREST. */
  missing: [] as string[],
  /** Set to make the next shop read fail. */
  shopError: null as { message: string } | null,
}));

/**
 * A PostgREST-shaped fake: `.select().eq().order().limit()` then await, plus
 * `.maybeSingle()`. Filters are applied when the result is READ, so a chain
 * built before its filters still answers correctly.
 */
const table = (name: string) => {
  const filters: [string, unknown][] = [];
  let inFilter: [string, unknown[]] | null = null;
  let limit: number | null = null;
  const rows = (): Record<string, unknown>[] => {
    let out = [...(state.tables[name] ?? [])];
    for (const [col, val] of filters) out = out.filter((r) => String(r[col]) === String(val));
    if (inFilter) {
      const [col, vals] = inFilter;
      out = out.filter((r) => vals.map(String).includes(String(r[col])));
    }
    if (limit !== null) out = out.slice(0, limit);
    return out;
  };
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return obj;
    },
    in: (col: string, vals: unknown[]) => {
      inFilter = [col, vals];
      return obj;
    },
    order: () => obj,
    limit: (n: number) => {
      limit = n;
      return obj;
    },
    // PostgREST's "one row or none": the shop read is the only one that can
    // also fail, which is how a dead connection is told apart from a shop
    // that simply is not there.
    maybeSingle: async () =>
      name === "shops" && state.shopError
        ? { data: null, error: state.shopError }
        : { data: rows()[0] ?? null, error: null },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(
        state.missing.includes(name)
          ? { data: null, error: { code: "42P01", message: `relation "${name}" does not exist` } }
          : { data: rows(), error: null },
      ).then(resolve, reject),
  };
  return obj;
};

const fakeDb = () => ({ from: (name: string) => table(name) }) as unknown as SupabaseClient;

const shopRow = (over: Record<string, unknown> = {}) => ({
  id: "shop-1",
  slug: "sitara",
  name: "সিতারা",
  phone: "01711111111",
  contact_email: "owner@example.com",
  zone_ids: ["z1"],
  prep_minutes: 15,
  commission_pct: 15,
  status: "active",
  is_open: true,
  rating_avg: 4.2,
  rating_count: 9,
  created_at: "2026-01-05T00:00:00Z",
  ...over,
});

const orderRow = (id: string, status: string, total: number, day: string) => ({
  id,
  order_no: `PS-${id}`,
  shop_id: "shop-1",
  status,
  total,
  created_at: `${day}T10:00:00Z`,
});

let load: typeof import("@/lib/db/admin-shop").loadAdminShopDetail;

beforeEach(async () => {
  state.shopError = null;
  state.missing = [];
  state.tables = {
    shops: [shopRow()],
    vendor_users: [
      {
        user_id: "u-owner",
        shop_id: "shop-1",
        role: "owner",
        display_name: "Sitara owner",
        login_email: "owner@example.com",
        created_at: "2026-01-05T00:00:00Z",
      },
      {
        user_id: "u-staff",
        shop_id: "shop-1",
        role: "staff",
        display_name: "Assistant",
        login_email: "01711111111@phone.prosanti.app",
        created_at: "2026-02-05T00:00:00Z",
      },
    ],
    products: [
      { id: "p1", shop_id: "shop-1", name: "Green panjabi", slug: "p1", price: 149000, status: "published", active: true, in_stock: true },
      { id: "p2", shop_id: "shop-1", name: "Draft panjabi", slug: "p2", price: 120000, status: "draft", active: true, in_stock: true },
      { id: "p3", shop_id: "shop-1", name: "Sold out", slug: "p3", price: 90000, status: "published", active: true, in_stock: false },
      { id: "p4", shop_id: "shop-2", name: "Another shop's", slug: "p4", price: 100000, status: "published", active: true, in_stock: true },
    ],
    orders: [
      orderRow("1", "delivered", 149000, "2026-09-01"),
      orderRow("2", "delivered", 100000, "2026-09-02"),
      orderRow("3", "pending", 50000, "2026-09-03"),
      orderRow("4", "cancelled", 90000, "2026-09-04"),
      orderRow("5", "preparing", 60000, "2026-09-05"),
    ],
    shop_ledger: [
      { id: "l1", shop_id: "shop-1", order_id: "o1", subtotal: 149000, commission: 22000, payable: 127000, created_at: "2026-09-01T10:00:00Z" },
      { id: "l2", shop_id: "shop-1", order_id: "o2", subtotal: 100000, commission: 15000, payable: 85000, created_at: "2026-09-02T10:00:00Z" },
      { id: "l3", shop_id: "shop-2", order_id: "o9", subtotal: 500000, commission: 1000, payable: 499000, created_at: "2026-09-02T10:00:00Z" },
    ],
    shop_payouts: [
      { id: "pay1", shop_id: "shop-1", amount: 150000, method: "bkash", reference: "TX1", paid_at: "2026-09-10T10:00:00Z" },
      { id: "pay2", shop_id: "shop-2", amount: 999000, method: "bank", reference: "TX2", paid_at: "2026-09-11T10:00:00Z" },
    ],
    shop_commission_history: [
      { id: 1, shop_id: "shop-1", created_at: "2026-01-05T00:00:00Z", old_pct: null, new_pct: 15.0, actor_id: null, actor_email: null },
      { id: 2, shop_id: "shop-1", created_at: "2026-03-01T00:00:00Z", old_pct: 15.0, new_pct: 12.5, actor_id: "staff-1", actor_email: "nazmul@prosanti.example" },
      { id: 3, shop_id: "shop-1", created_at: "2026-04-01T00:00:00Z", old_pct: 12.5, new_pct: 18.0, actor_id: "staff-2", actor_email: "other@prosanti.example" },
      { id: 4, shop_id: "shop-2", created_at: "2026-04-01T00:00:00Z", old_pct: 10.0, new_pct: 20.0, actor_id: "staff-3", actor_email: "third@prosanti.example" },
    ],
    reviews: [
      { id: "r1", shop_id: "shop-1", product_id: "p1", rating: 5, author: "Rahim", title: null, body: "Lovely", status: "approved", created_at: "2026-09-01T00:00:00Z" },
      { id: "r2", shop_id: "shop-1", product_id: "p1", rating: 4, author: "Karim", title: null, body: "Good", status: "pending", created_at: "2026-09-02T00:00:00Z" },
      { id: "r3", shop_id: "shop-2", product_id: "p4", rating: 1, author: "Other", title: null, body: "Not mine", status: "approved", created_at: "2026-09-02T00:00:00Z" },
    ],
  };
  ({ loadAdminShopDetail: load } = await import("@/lib/db/admin-shop"));
});

describe("loadAdminShopDetail — scoping", () => {
  it("returns null for a shop that is not there, instead of an empty file", async () => {
    expect(await load(fakeDb(), "shop-404")).toBeNull();
    expect(await load(fakeDb(), "")).toBeNull();
  });

  it("reads ONLY this shop's rows — another shop's money never appears", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail).not.toBeNull();
    expect(detail?.ledger.earned).toBe(212000); // 127000 + 85000, not 499000
    expect(detail?.ledger.paid).toBe(150000); // not 999000
    expect(detail?.reviews.count).toBe(2);
    expect(detail?.catalog.total).toBe(3); // the other shop's product is not here
  });

  it("fails honestly when the shop read itself fails", async () => {
    state.shopError = { message: "connection lost" };
    expect(await load(fakeDb(), "shop-1")).toBeNull();
  });
});

describe("loadAdminShopDetail — money", () => {
  it("counts what shoppers actually paid: cancelled orders are not revenue", async () => {
    const detail = await load(fakeDb(), "shop-1");
    // 149000 + 100000 + 50000 + 60000 — the 90000 cancellation is out.
    expect(detail?.orders.revenue).toBe(359000);
    expect(detail?.orders.count).toBe(5);
    expect(detail?.orders.cancelled).toBe(1);
    expect(detail?.orders.delivered).toBe(2);
  });

  it("knows how many orders the shop still has to work through", async () => {
    const detail = await load(fakeDb(), "shop-1");
    // pending + preparing = still to do. Delivered and cancelled are settled.
    expect(detail?.orders.open).toBe(2);
  });

  it("reports the balance as earned minus paid, and the last payout", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.ledger.balance).toBe(212000 - 150000);
    expect(detail?.ledger.lastPayoutAt).toBe(Date.parse("2026-09-10T10:00:00Z"));
    expect(detail?.ledger.payouts).toHaveLength(1);
  });

  it("shows the newest money first", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.ledger.lines[0]?.id).toBe("l1");
  });
});

describe("loadAdminShopDetail — catalog and reviews", () => {
  it("splits the catalog the way a shopkeeper thinks: live, draft, hidden, no stock", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.catalog.published).toBe(2);
    expect(detail?.catalog.drafts).toBe(1);
    expect(detail?.catalog.outOfStock).toBe(1);
    expect(detail?.catalog.hidden).toBe(0);
  });

  it("averages the ratings and counts what is still waiting on moderation", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.reviews.average).toBeCloseTo(4.5, 5);
    expect(detail?.reviews.public).toBe(1);
    expect(detail?.reviews.pending).toBe(1);
    expect(detail?.reviews.recent).toHaveLength(2);
  });
});

describe("loadAdminShopDetail — the commission trail (C4)", () => {
  it("counts MOVES, not lines — the join is not a change", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.commission.lines).toHaveLength(3);
    expect(detail?.commission.changes).toBe(2);
    expect(detail?.commission.current).toBe(15);
  });

  it("reads the newest move as the last line, with the officer who made it", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.commission.last?.toPct).toBe(18);
    expect(detail?.commission.last?.fromPct).toBe(12.5);
    expect(detail?.commission.last?.actorEmail).toBe("other@prosanti.example");
  });

  it("reads the join line as 'no rate before it'", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.commission.lines[0]?.fromPct).toBeNull();
    expect(detail?.commission.lines[0]?.toPct).toBe(15);
  });

  it("never shows another shop's trail", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(
      detail?.commission.lines.some((l) => l.actorEmail === "third@prosanti.example"),
    ).toBe(false);
  });

  it("says the history is unavailable rather than pretending nothing moved", async () => {
    // A database without the migration answers 42P01: the rest of the file
    // must still load, and the card must be able to say why it is empty.
    state.missing = ["shop_commission_history"];
    const detail = await load(fakeDb(), "shop-1");
    expect(detail).not.toBeNull();
    expect(detail?.commission.available).toBe(false);
    expect(detail?.commission.lines).toEqual([]);
    expect(detail?.orders.count).toBe(5); // the rest of the file is intact
  });
});

describe("loadAdminShopDetail — who can sign in (C1)", () => {
  it("puts the owner first and keeps the assistant's login readable", async () => {
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.staff.map((s) => s.role)).toEqual(["owner", "staff"]);
    expect(detail?.staff[0].name).toBe("Sitara owner");
    expect(detail?.staff[1].login).toBe("01711111111@phone.prosanti.app");
  });

  it("leaves an unlinked shop with an empty roster, not a guessed one", async () => {
    state.tables.vendor_users = [];
    const detail = await load(fakeDb(), "shop-1");
    expect(detail?.staff).toEqual([]);
  });
});
