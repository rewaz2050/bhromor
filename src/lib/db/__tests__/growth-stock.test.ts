/**
 * P2 #2 — back-in-stock watches. The row is "call this number when the
 * product is back in stock"; the restock flag hands staff that call list
 * once per out-of-stock → in-stock transition.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  watchers: [] as { id: string; phone: string }[],
  upserts: [] as { product_id: string; phone: string }[],
  updates: [] as { set: Record<string, unknown>; ids: string[] }[],
  notifications: [] as Record<string, unknown>[],
  staffIds: ["s1", "s2"],
  watchSelectError: null as { message: string } | null,
  deleteFilters: [] as [string, string][],
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
  state.upserts = [];
  state.updates = [];
  state.notifications = [];
  state.staffIds = ["s1", "s2"];
  state.watchSelectError = null;
});

import { createStockWatch, deleteStockWatch, flagRestockForStaff } from "../growth";

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
