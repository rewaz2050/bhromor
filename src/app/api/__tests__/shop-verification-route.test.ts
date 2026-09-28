/**
 * B5 (2026-09-28) — the verification endpoint's gate and its shape.
 *
 * Only staff may touch a badge, the officer must be the STAFF SESSION (a body
 * that claims to be somebody else must be ignored), and the actor id/email are
 * never taken from the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  opts: [] as ({ limit?: number; roles?: readonly string[] } | undefined)[],
  /** Never cleared: the routes call staffRoute at import time. */
  allOpts: [] as ({ limit?: number; roles?: readonly string[] } | undefined)[],
  rows: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  readAnswer: null as Record<string, unknown> | null,
  updatePatch: null as Record<string, unknown> | null,
}));

vi.mock("../admin/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../admin/_lib")>();
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: state.readAnswer, error: null }),
  };
  const db = {
    from: (table: string) => {
      if (table === "shop_verification_events") {
        return {
          select: () => chain,
          insert: async (row: Record<string, unknown>) => {
            state.events.push(row);
            return { data: null, error: null };
          },
        };
      }
      return {
        select: () => chain,
        update: (patch: Record<string, unknown>) => {
          state.updatePatch = patch;
          const upd: Record<string, unknown> = {};
          upd.eq = () => upd;
          upd.select = () => upd;
          upd.maybeSingle = async () => ({
            data: { ...SHOP_ROW, ...patch },
            error: null,
          });
          return upd;
        },
      };
    },
  };
  return {
    ...orig,
    staffRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => unknown,
      opts?: { limit?: number; roles?: readonly string[] },
    ) => {
      state.opts.push(opts);
      state.allOpts.push(opts);
      return (req: Request, routeCtx?: unknown) =>
        handler({ db, user: { id: "staff-1", email: "staff@prosanti.example" } }, req, routeCtx);
    },
  };
});

import { GET as history, POST as verify } from "@/app/api/admin/shops/[id]/verification/route";

/** A whole shops row — the mapper runs on it, so it must be complete. */
const SHOP_ROW = {
  id: "s1",
  slug: "sitara",
  name: "Sitara Boutique",
  tagline: "",
  logo_url: "",
  phone: "01711111111",
  contact_email: "",
  address: "",
  zone_ids: [],
  prep_minutes: 15,
  commission_pct: 15,
  status: "active",
  is_open: true,
  rating_avg: 0,
  rating_count: 0,
};

const post = (body: unknown): Request =>
  new Request("http://localhost/api/admin/shops/s1/verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id = "s1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.opts = [];
  state.events = [];
  state.updatePatch = null;
  state.readAnswer = { nid_checked: false, trade_licence_checked: false, verified_at: null };
});

describe("POST /api/admin/shops/[id]/verification", () => {
  it("is gated to admin / super_admin", async () => {
    await verify(post({ nid: true, tradeLicence: true }), ctx());
    expect(state.allOpts.map((o) => o?.roles)).toEqual([
      ["admin", "super_admin"],
      ["admin", "super_admin"],
    ]);
  });

  it("writes the session's officer — never the body's", async () => {
    const res = await verify(
      post({ nid: true, tradeLicence: true, actor_email: "attacker@example.com", verified_by: "someone-else" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(state.updatePatch).toMatchObject({
      nid_checked: true,
      trade_licence_checked: true,
      verified_by: "staff-1",
      verified_by_email: "staff@prosanti.example",
    });
    expect(state.events[0]).toMatchObject({
      actor_id: "staff-1",
      actor_email: "staff@prosanti.example",
      action: "verified",
    });
  });

  it("refuses an empty submission instead of quietly wiping a badge", async () => {
    // The mocked staffRoute does not map errors to responses; the real one
    // turns this AdminInputError into a 422, and that status is what counts.
    await expect(verify(post({ nid: false, tradeLicence: false }), ctx())).rejects.toMatchObject({
      status: 422,
    });
    expect(state.updatePatch).toBeNull();
  });

  it("returns the shop with its badge so the row on screen cannot drift", async () => {
    const res = await verify(post({ nid: true, tradeLicence: true }), ctx());
    const body = (await res.json()) as { shop?: { verification?: { nid?: boolean } } };
    expect(body.shop?.verification?.nid).toBe(true);
  });
});

describe("GET /api/admin/shops/[id]/verification", () => {
  it("is gated to staff and returns the trail", async () => {
    state.readAnswer = {
      verification_note: "NID + licence seen",
      verified_by: "staff-1",
      verified_by_email: "staff@prosanti.example",
      verified_at: "2026-09-28T12:00:00.000Z",
    };
    const res = await history(
      new Request("http://localhost/api/admin/shops/s1/verification"),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      audit?: { byEmail?: string; note?: string };
      events?: unknown[];
    };
    expect(body.audit?.byEmail).toBe("staff@prosanti.example");
    expect(body.audit?.note).toBe("NID + licence seen");
    expect(Array.isArray(body.events)).toBe(true);
  });
});
