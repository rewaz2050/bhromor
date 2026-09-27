/**
 * "রিভিউ লিখুন, স্ট্যাম্প পান" (UX plan §4/§7, R10; migration 202609270004).
 *   • provenPurchase — a delivered order on THIS phone that contains the
 *     piece; a look-alike phone or another product proves nothing;
 *   • countStampsForPhone — orders + ledger rows, ledger missing → orders only;
 *   • awardReviewStamp — approved verified review → one ledger row + one
 *     push; duplicate or unproven → nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  orders: [] as { id: string; order_no: string; customer_phone: string; status: string }[],
  items: [] as { order_id: string; product_id: string }[],
  ledger: [] as Record<string, unknown>[],
  ledgerMissing: false,
  ledgerInserts: [] as Record<string, unknown>[],
  pushes: [] as { phone: string; title: string; href: string }[],
}));

vi.mock("@/lib/customer-push", () => ({
  pushCustomerMessage: async (
    _db: unknown,
    input: { phone: string; build: (lang: "en" | "bn") => { title: string; body: string; href: string } },
  ) => {
    const msg = input.build("bn");
    state.pushes.push({ phone: input.phone, title: msg.title, href: msg.href });
    return 1;
  },
}));

const digits = (p: string) => p.replace(/\D/g, "").slice(-10);

/** Enough PostgREST to run the three helpers. */
const fakeDb = (): SupabaseClient => {
  const from = (table: string) => {
    const filters: { col: string; value: unknown; kind: "eq" | "ilike" | "in" }[] = [];
    let counting = false;
    const chain: Record<string, unknown> = {};
    const rows = (): Record<string, unknown>[] => {
      const source: Record<string, unknown>[] =
        table === "orders" ? state.orders : table === "order_items" ? state.items : state.ledger;
      return source.filter((row) =>
        filters.every((f) => {
          const v = row[f.col];
          if (f.kind === "eq") return v === f.value;
          if (f.kind === "in") return (f.value as unknown[]).includes(v);
          // ilike with the %d%i%g%i%t%s% needle ≈ "ends with these digits"
          return typeof v === "string" && digits(v) === digits(String(f.value).replace(/%/g, ""));
        }),
      );
    };
    const resolve = () => {
      if (table === "stamp_ledger" && state.ledgerMissing) {
        return { data: null, count: null, error: { code: "42P01", message: "missing" } };
      }
      const data = rows();
      return counting ? { data: null, count: data.length, error: null } : { data, error: null };
    };
    Object.assign(chain, {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) counting = true;
        return chain;
      },
      eq: (col: string, value: unknown) => {
        filters.push({ col, value, kind: "eq" });
        return chain;
      },
      neq: () => chain,
      ilike: (col: string, value: unknown) => {
        filters.push({ col, value, kind: "ilike" });
        return chain;
      },
      in: (col: string, value: unknown[]) => {
        filters.push({ col, value, kind: "in" });
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      insert: (row: Record<string, unknown>) => {
        if (table !== "stamp_ledger") throw new Error(`unexpected insert into ${table}`);
        if (state.ledgerMissing) return Promise.resolve({ error: { code: "42P01" } });
        if (state.ledger.some((r) => r.kind === row.kind && r.ref_id === row.ref_id)) {
          return Promise.resolve({ error: { code: "23505" } });
        }
        state.ledger.push(row);
        state.ledgerInserts.push(row);
        return Promise.resolve({ error: null });
      },
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onOk, onErr),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
};

beforeEach(() => {
  state.orders = [
    { id: "o1", order_no: "PS-20260920-0001", customer_phone: "01711111111", status: "delivered" },
    { id: "o2", order_no: "PS-20260921-0002", customer_phone: "01711111111", status: "confirmed" },
    { id: "o3", order_no: "PS-20260922-0003", customer_phone: "01722222222", status: "delivered" },
  ];
  state.items = [
    { order_id: "o1", product_id: "p1" },
    { order_id: "o2", product_id: "p2" },
    { order_id: "o3", product_id: "p2" },
  ];
  state.ledger = [];
  state.ledgerMissing = false;
  state.ledgerInserts = [];
  state.pushes = [];
});

describe("provenPurchase — delivered order on this phone with this piece", () => {
  it("finds the delivered order that contains the product", async () => {
    const { provenPurchase } = await import("@/lib/db/orders");
    await expect(provenPurchase(fakeDb(), { phone: "+880 1711-111111", productId: "p1" })).resolves.toEqual({
      orderNo: "PS-20260920-0001",
    });
  });

  it("proves nothing for an undelivered order, another phone or another piece", async () => {
    const { provenPurchase } = await import("@/lib/db/orders");
    const db = fakeDb();
    // p2 for this phone is only in the confirmed (undelivered) order
    await expect(provenPurchase(db, { phone: "01711111111", productId: "p2" })).resolves.toBeNull();
    // p2 was delivered — to a different phone
    await expect(provenPurchase(db, { phone: "01733333333", productId: "p2" })).resolves.toBeNull();
    await expect(provenPurchase(db, { phone: "01711111111", productId: "p9" })).resolves.toBeNull();
    await expect(provenPurchase(db, { phone: "", productId: "p1" })).resolves.toBeNull();
  });

  it("honours the order number the track page passed", async () => {
    const { provenPurchase } = await import("@/lib/db/orders");
    await expect(
      provenPurchase(fakeDb(), { phone: "01711111111", productId: "p1", orderNo: "ps-20260920-0001" }),
    ).resolves.toEqual({ orderNo: "PS-20260920-0001" });
    await expect(
      provenPurchase(fakeDb(), { phone: "01711111111", productId: "p1", orderNo: "PS-20260921-0002" }),
    ).resolves.toBeNull();
  });
});

describe("countStampsForPhone — orders + review ledger", () => {
  it("adds ledger rows to the order count", async () => {
    const { countStampsForPhone } = await import("@/lib/db/orders");
    state.ledger = [
      { phone: "01711111111", kind: "review", ref_id: "r1" },
      { phone: "01711111111", kind: "review", ref_id: "r2" },
      { phone: "01722222222", kind: "review", ref_id: "r3" },
    ];
    const out = await countStampsForPhone(fakeDb(), "01711111111");
    expect(out.reviews).toBe(2);
    expect(out.total).toBe(out.orders + 2);
  });

  it("counts orders only while the ledger table is missing", async () => {
    const { countStampsForPhone, countLedgerStampsForPhone } = await import("@/lib/db/orders");
    state.ledgerMissing = true;
    await expect(countLedgerStampsForPhone(fakeDb(), "01711111111")).resolves.toBe(0);
    const out = await countStampsForPhone(fakeDb(), "01711111111");
    expect(out.reviews).toBe(0);
    expect(out.total).toBe(out.orders);
  });
});

describe("awardReviewStamp — approve once, pay once", () => {
  it("writes one ledger row and tells the shopper", async () => {
    const { awardReviewStamp } = await import("@/lib/db/admin");
    const db = fakeDb();
    const review = { id: "r1", verified: true, customer_phone: "01711111111" };
    await expect(awardReviewStamp(db, review, "Heritage Green Panjabi")).resolves.toBe(true);
    expect(state.ledgerInserts).toEqual([
      { phone: "01711111111", kind: "review", ref_id: "r1", note: "Heritage Green Panjabi" },
    ]);
    expect(state.pushes).toEqual([
      { phone: "01711111111", title: "রিভিউর জন্য ধন্যবাদ — ১টা স্ট্যাম্প যোগ হলো", href: "/account" },
    ]);
    // approve → hide → approve again: the unique key stops a second stamp
    await expect(awardReviewStamp(db, review, "Heritage Green Panjabi")).resolves.toBe(false);
    expect(state.ledgerInserts).toHaveLength(1);
    expect(state.pushes).toHaveLength(1);
  });

  it("does nothing for unproven reviews or before the migration", async () => {
    const { awardReviewStamp } = await import("@/lib/db/admin");
    const db = fakeDb();
    await expect(awardReviewStamp(db, { id: "r2", verified: false, customer_phone: "01711111111" }, "X")).resolves.toBe(false);
    await expect(awardReviewStamp(db, { id: "r3", verified: true, customer_phone: null }, "X")).resolves.toBe(false);
    state.ledgerMissing = true;
    await expect(awardReviewStamp(db, { id: "r4", verified: true, customer_phone: "01711111111" }, "X")).resolves.toBe(false);
    expect(state.ledgerInserts).toHaveLength(0);
    expect(state.pushes).toHaveLength(0);
  });
});
