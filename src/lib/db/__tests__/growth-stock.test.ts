/**
 * P2 #2 — back-in-stock watches. The row is "tell this number when the product
 * is back in stock"; since 2026-09-24 a watcher whose phone has the shopper
 * push on is told instantly, and the staff call list keeps only the numbers
 * that could not be reached (which is every number when push is unconfigured
 * or nobody opted in — the honest fallback).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  watchers: [] as { id: string; phone: string }[],
  priceWatchers: [] as { id: string; phone: string; last_notified_paisa: number | null }[],
  upserts: [] as { product_id: string; phone: string }[],
  updates: [] as { set: Record<string, unknown>; ids: string[] }[],
  notifications: [] as Record<string, unknown>[],
  staffIds: ["s1", "s2"],
  watchSelectError: null as { message: string } | null,
  deleteFilters: [] as [string, string][],
  /** Which phones the push fan-out reports as reached. */
  reached: [] as string[],
  pushCalls: [] as {
    phones: string[];
    kind: string;
    productName: string;
    pricePaisa?: number | null;
    href?: string | null;
  }[],
}));

vi.mock("@/lib/customer-push", () => ({
  pushProductEvent: async (
    _db: unknown,
    input: { phones: string[]; kind: string; productName: string },
  ) => {
    state.pushCalls.push(input);
    return {
      accepted: state.reached.length,
      devices: state.reached.length,
      reached: state.reached,
    };
  },
}));

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.order = () => obj;
  obj.limit = () => obj;
  obj.in = () => obj;
  return obj;
};

const fakeDb = (): SupabaseClient => ({
  from: (table: string) => {
    switch (table) {
      case "stock_watches": {
        const deleteObj: Record<string, unknown> = { data: null, error: null };
        deleteObj.eq = (col: string, val: string) => {
          state.deleteFilters.push([col, val]);
          return deleteObj;
        };
        return {
          select: () =>
            chain(state.watchSelectError ? null : state.watchers, state.watchSelectError),
          upsert: (vals: { product_id: string; phone: string }) => {
            state.upserts.push(vals);
            return { data: null, error: null };
          },
          delete: () => deleteObj,
          update: (set: Record<string, unknown>) => ({
            in: (_col: string, ids: string[]) => {
              state.updates.push({ set, ids });
              return { data: null, error: null };
            },
          }),
        };
      }
      case "price_watches":
        return {
          select: () => chain(state.priceWatchers),
          update: (set: Record<string, unknown>) => ({
            in: (_col: string, ids: string[]) => {
              state.updates.push({ set, ids });
              // The real table remembers the price it told them about — that
              // is what makes a second save of the same price a non-event.
              for (const w of state.priceWatchers) {
                if (ids.includes(w.id)) w.last_notified_paisa = Number(set.last_notified_paisa);
              }
              return { data: null, error: null };
            },
          }),
        };
      case "admin_users":
        return {
          select: () => chain(state.staffIds.map((id) => ({ id }))),
        };
      case "notifications":
        return {
          insert: (rows: Record<string, unknown>[]) => {
            state.notifications.push(...rows);
            return { data: null, error: null };
          },
        };
      default:
        return { select: () => chain([]) };
    }
  },
} as unknown as SupabaseClient);

beforeEach(() => {
  state.watchers = [];
  state.priceWatchers = [];
  state.upserts = [];
  state.updates = [];
  state.notifications = [];
  state.staffIds = ["s1", "s2"];
  state.watchSelectError = null;
  state.reached = [];
  state.pushCalls = [];
});

import {
  createStockWatch,
  deleteStockWatch,
  flagPriceDropForStaff,
  flagRestockForStaff,
} from "../growth";

const bodies = () => state.notifications.map((n) => String(n.body));

describe("stock watches (P2 #2)", () => {
  it("stores one row per (product, phone), normalizing the number", async () => {
    await createStockWatch(fakeDb(), {
      productId: "p1",
      phone: "+880 1700-000000",
    });
    expect(state.upserts).toEqual([{ product_id: "p1", phone: "01700000000" }]);
  });

  it("deleting targets exactly that product + that number", async () => {
    await deleteStockWatch(fakeDb(), { productId: "p1", phone: "01700000000" });
    expect(state.deleteFilters).toEqual([
      ["product_id", "p1"],
      ["phone", "01700000000"],
    ]);
  });

  it("a restock with nobody waiting is a no-op", async () => {
    state.watchers = [];
    const notified = await flagRestockForStaff(fakeDb(), {
      productId: "p1",
      productName: "Black Panjabi",
    });
    expect(notified).toBe(0);
    expect(state.notifications).toHaveLength(0);
  });

  it("hands staff the call list once, for every staff inbox", async () => {
    state.watchers = [
      { id: "w1", phone: "01711111111" },
      { id: "w2", phone: "01822222222" },
    ];
    const notified = await flagRestockForStaff(fakeDb(), {
      productId: "p1",
      productName: "Black Panjabi",
    });
    expect(notified).toBe(2);
    // One notification row per staff member, carrying the numbers.
    expect(state.notifications).toHaveLength(2);
    expect(state.notifications.map((n) => n.recipient).sort()).toEqual(["s1", "s2"]);
    for (const n of state.notifications) {
      expect(n.title).toContain("Black Panjabi");
      expect(n.body).toContain("01711111111");
      expect(n.body).toContain("01822222222");
    }
    // Every watcher is marked notified so the admin screen can show when.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].ids.sort()).toEqual(["w1", "w2"]);
    expect(state.updates[0].set.last_notified_at).toBeTruthy();
  });

  it("a broken watchers read is not fatal — no note, no throw", async () => {
    state.watchSelectError = { message: "boom" };
    const notified = await flagRestockForStaff(fakeDb(), {
      productId: "p1",
      productName: "Black Panjabi",
    });
    expect(notified).toBe(0);
    expect(state.notifications).toHaveLength(0);
  });
});

/**
 * The half that shrinks the phone bill: a watcher who turned phone
 * notifications on is pushed instead of called (2026-09-24).
 */
describe("watches push to subscribed phones, and staff only call the rest", () => {
  it("keeps only the unreachable numbers on the call list", async () => {
    state.watchers = [
      { id: "w1", phone: "01711111111" },
      { id: "w2", phone: "01822222222" },
    ];
    state.reached = ["01711111111"];
    const notified = await flagRestockForStaff(fakeDb(), {
      productId: "p1",
      productName: "Black Panjabi",
      productSlug: "black-panjabi",
      pricePaisa: 124000,
    });

    expect(notified).toBe(2);
    expect(state.pushCalls).toHaveLength(1);
    expect(state.pushCalls[0]).toMatchObject({
      phones: ["01711111111", "01822222222"],
      kind: "back-in-stock",
      href: "/product/black-panjabi",
      pricePaisa: 124000,
    });
    // 01711111111 already knows — only the other number is left to call.
    expect(state.notifications[0].body).toContain("01822222222");
    expect(state.notifications[0].body).not.toContain("01711111111");
    expect(state.notifications[0].body).toContain("1 জনকে ফোনে খবর পাঠানো হয়েছে");
    // Everyone is still marked notified: the round is spent either way.
    expect(state.updates[0].ids.sort()).toEqual(["w1", "w2"]);
  });

  it("says there is nothing to call when every watcher heard it", async () => {
    state.watchers = [{ id: "w1", phone: "01711111111" }];
    state.reached = ["01711111111"];
    await flagRestockForStaff(fakeDb(), { productId: "p1", productName: "Black Panjabi" });
    expect(bodies()[0]).toContain("কাউকে ফোন করতে হবে না");
    expect(bodies()[0]).not.toContain("01711111111");
  });

  it("a price drop pushes each watcher once per new price, with the product link", async () => {
    state.priceWatchers = [
      { id: "p1", phone: "01711111111", last_notified_paisa: null },
      { id: "p2", phone: "01822222222", last_notified_paisa: 150000 },
    ];
    state.reached = ["01711111111", "01822222222"];
    const notified = await flagPriceDropForStaff(fakeDb(), {
      productId: "prod-1",
      productName: "Black Panjabi",
      fromPaisa: 150000,
      toPaisa: 124000,
      productSlug: "black-panjabi",
    });

    expect(notified).toBe(2);
    expect(state.pushCalls[0]).toMatchObject({
      kind: "price-drop",
      href: "/product/black-panjabi",
      pricePaisa: 124000,
    });
    expect(bodies()[0]).toContain("৳1,500 → ৳1,240");
    expect(bodies()[0]).toContain("কাউকে ফোন করতে হবে না");
    expect(state.updates[0].set.last_notified_paisa).toBe(124000);

    // Saving the same price again is not a new event.
    expect(
      await flagPriceDropForStaff(fakeDb(), {
        productId: "prod-1",
        productName: "Black Panjabi",
        fromPaisa: 150000,
        toPaisa: 124000,
      }),
    ).toBe(0);
    expect(state.pushCalls).toHaveLength(1);
  });
});
