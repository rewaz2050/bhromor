/**
 * C4 (2026-09-29) — GET /api/admin/shops/[id]/commission.
 *
 * The gate and the honesty of the empty state. "This shop's rate has never
 * moved" and "this database is not recording moves" are different sentences,
 * and a page about money has to be able to tell them apart.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  // Never cleared: the route calls staffRoute at IMPORT time.
  allOpts: [] as ({ limit?: number; roles?: readonly string[] } | undefined)[],
  changes: null as Record<string, unknown>[] | null,
  error: null as { message: string; status?: number } | null,
  askedId: "" as string,
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

vi.mock("@/lib/db/commission-audit", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/commission-audit")>();
  return {
    ...orig,
    listCommissionHistory: async (_db: unknown, id: string) => {
      state.askedId = id;
      if (state.error) {
        const { AdminInputError } = await import("@/lib/db/admin");
        throw new AdminInputError(state.error.message, state.error.status ?? 500);
      }
      return state.changes ?? [];
    },
  };
});

import { GET } from "@/app/api/admin/shops/[id]/commission/route";

const call = (id: string) =>
  GET(new Request(`http://localhost/api/admin/shops/${id}/commission`), {
    params: Promise.resolve({ id }),
  });

const lines = () => [
  { id: "1", shopId: "shop-1", fromPct: null, toPct: 15, at: Date.parse("2026-01-05T00:00:00Z"), actorId: null, actorEmail: null },
  { id: "2", shopId: "shop-1", fromPct: 15, toPct: 12.5, at: Date.parse("2026-03-01T00:00:00Z"), actorId: "staff-1", actorEmail: "nazmul@prosanti.example" },
];

beforeEach(() => {
  state.changes = lines();
  state.error = null;
  state.askedId = "";
});

describe("GET /api/admin/shops/[id]/commission", () => {
  it("is admin-only — a colleague's e-mail is in these rows", async () => {
    const res = await call("shop-1");
    expect(res.status).toBe(200);
    expect(state.allOpts[0]?.roles).toEqual(["admin", "super_admin"]);
  });

  it("answers with the trail, and asks for the shop in the URL (not the body)", async () => {
    const res = await call("shop-1");
    const body = (await res.json()) as { changes?: { toPct: number }[] };
    expect(res.status).toBe(200);
    expect(body.changes?.map((c) => c.toPct)).toEqual([15, 12.5]);
    expect(state.askedId).toBe("shop-1");
  });

  it("says 400 when the route has no shop to speak of", async () => {
    const res = await call("");
    expect(res.status).toBe(400);
  });

  it("keeps 'not installed' distinguishable from 'never changed'", async () => {
    state.changes = [];
    const empty = await call("shop-1");
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { changes: unknown[] }).changes).toEqual([]);

    state.error = { message: "Commission history is not set up on this database yet.", status: 503 };
    const missing = await call("shop-1");
    expect(missing.status).toBe(503);
    const body = (await missing.json()) as { error?: string };
    expect(body.error).toMatch(/not set up/i);
  });
});
