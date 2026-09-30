/**
 * C3 (2026-09-29) — GET /api/admin/shops/[id] (the shop's whole file).
 *
 * The gate matters: this file carries the owner's login, the shop's ledger and
 * what PROSANTI owes it. And the 404 matters more than it looks — an empty
 * dossier would read exactly like a shop that has never taken an order, so a
 * stale link must say "not on PROSANTI" instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  /** Never cleared: the route calls staffRoute at IMPORT time, before any hook. */
  allOpts: [] as ({ limit?: number; roles?: readonly string[] } | undefined)[],
  answer: null as Record<string, unknown> | null,
  askedId: "" as string,
  throws: false,
}));

vi.mock("../admin/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../admin/_lib")>();
  return {
    ...orig,
    staffRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => unknown,
      opts?: { limit?: number; roles?: readonly string[] },
    ) => {
      state.allOpts.push(opts);
      return (req: Request, routeCtx?: unknown) =>
        handler({ db: { __fake: true }, user: { id: "staff-1" } }, req, routeCtx);
    },
  };
});

vi.mock("@/lib/db/admin-shop", () => ({
  loadAdminShopDetail: async (_db: unknown, id: string) => {
    if (state.throws) throw new Error("connection lost");
    state.askedId = id;
    return state.answer;
  },
}));

import { GET } from "@/app/api/admin/shops/[id]/route";

const call = (id: string) =>
  GET(new Request(`http://localhost/api/admin/shops/${id}`), {
    params: Promise.resolve({ id }),
  });

const file = (over: Record<string, unknown> = {}) => ({
  shop: { id: "shop-1", slug: "sitara", name: "সিতারা" },
  staff: [],
  catalog: { total: 0, published: 0, drafts: 0, hidden: 0, outOfStock: 0, sample: [], windowFull: false },
  orders: { recent: [], count: 0, delivered: 0, cancelled: 0, open: 0, revenue: 0, windowFull: false, window: 500 },
  ledger: { earned: 0, paid: 0, balance: 0, lastPayoutAt: null, lines: [], payouts: [] },
  reviews: { count: 0, average: 0, public: 0, pending: 0, recent: [] },
  ...over,
});

beforeEach(() => {
  state.answer = file();
  state.askedId = "";
  state.throws = false;
});

describe("GET /api/admin/shops/[id]", () => {
  it("is admin-only — the file carries the owner's login and the money", async () => {
    const res = await call("shop-1");
    expect(res.status).toBe(200);
    expect(state.allOpts[0]?.roles).toEqual(["admin", "super_admin"]);
  });

  it("answers with the whole file, shop included", async () => {
    const res = await call("shop-1");
    const body = (await res.json()) as { shop?: { name: string }; detail?: { orders: unknown } };
    expect(res.status).toBe(200);
    expect(body.shop?.name).toBe("সিতারা");
    expect(body.detail?.orders).toBeTruthy();
    expect(state.askedId).toBe("shop-1");
  });

  it("says 404 for a shop that is not there — never an empty file", async () => {
    state.answer = null;
    const res = await call("shop-404");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/not on prosanti/i);
  });

  it("says 404 when the database read itself fails, instead of inventing a shop", async () => {
    state.throws = true;
    const res = await call("shop-1");
    expect(res.status).toBe(404);
  });
});
