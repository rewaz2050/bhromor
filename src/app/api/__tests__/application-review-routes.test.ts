/**
 * Round 4 (2026-09-26) — staff decisions on applications:
 * POST /api/admin/{shops,riders}/[id]/review stamps who decided and when,
 * requires a reason for a rejection, and boots a non-active row offline.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  updates: [] as { table: string; patch: Record<string, unknown>; id: string }[],
  row: null as Record<string, unknown> | null,
  error: null as { code?: string; message: string } | null,
  routeOpts: [] as unknown[],
}));

vi.mock("../admin/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../admin/_lib")>();
  const db = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          state.updates.push({ table, patch, id });
          return {
            select: () => ({
              single: async () => ({ data: state.error ? null : state.row, error: state.error }),
            }),
          };
        },
      }),
    }),
  };
  return {
    ...orig,
    staffRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => Promise<Response>,
      opts?: unknown,
    ) => {
      state.routeOpts.push(opts);
      return async (req: Request, routeCtx?: unknown) => {
        try {
          return await handler({ db, user: { id: "staff-1", email: "Admin@Prosanti.example" } }, req, routeCtx);
        } catch (err) {
          const e = err as { message: string; status?: number };
          return Response.json({ error: e.message }, { status: e.status ?? 500 });
        }
      };
    },
  };
});

import { POST as shopReview } from "../admin/shops/[id]/review/route";
import { POST as riderReview } from "../admin/riders/[id]/review/route";

const SHOP_ROW = {
  id: "shop-1",
  slug: "arian",
  name: "Arian",
  tagline: "",
  logo_url: "",
  phone: "01712345678",
  contact_email: "01712345678@phone.prosanti.app",
  address: "",
  zone_ids: [],
  prep_minutes: 15,
  commission_pct: 15,
  status: "rejected",
  is_open: false,
  rating_avg: 0,
  rating_count: 0,
  created_at: "2026-09-26T00:00:00.000Z",
  review_note: "Phone never answers",
  reviewed_by: "staff-1",
  reviewed_by_email: "admin@prosanti.example",
  reviewed_at: "2026-09-26T09:00:00.000Z",
};

const RIDER_ROW = {
  id: "rider-1",
  user_id: "u-1",
  name: "Tanvir",
  phone: "01811111111",
  contact_email: "rider@example.com",
  vehicle: "bike",
  zone_ids: [],
  status: "active",
  is_online: false,
  cash_in_hand: 0,
  rating_avg: 0,
  rating_count: 0,
  created_at: "2026-09-26T00:00:00.000Z",
  kyc: {},
};

const post = (handler: typeof shopReview, id: string, body: unknown) =>
  handler(
    new Request("http://x/review", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  state.updates = [];
  state.row = SHOP_ROW;
  state.error = null;
});

describe("POST /api/admin/shops/[id]/review", () => {
  it("rejects with a note and stamps the audit columns", async () => {
    const res = await post(shopReview, "shop-1", { status: "rejected", note: "  Phone never answers  " });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shop: { status: string; review?: { note?: string; by?: string; at?: number } } };
    expect(body.shop.status).toBe("rejected");
    expect(body.shop.review).toEqual({
      note: "Phone never answers",
      by: "admin@prosanti.example",
      at: Date.parse("2026-09-26T09:00:00.000Z"),
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ table: "shops", id: "shop-1" });
    expect(state.updates[0].patch).toMatchObject({
      status: "rejected",
      review_note: "Phone never answers",
      reviewed_by: "staff-1",
      reviewed_by_email: "admin@prosanti.example",
      is_open: false,
    });
    expect(typeof state.updates[0].patch.reviewed_at).toBe("string");
  });

  it("refuses a rejection without a usable reason", async () => {
    const res = await post(shopReview, "shop-1", { status: "rejected", note: "no" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/reason/i);
    expect(state.updates).toEqual([]);
  });

  it("refuses an unknown decision instead of silently pending it", async () => {
    const res = await post(shopReview, "shop-1", { status: "approved" });
    expect(res.status).toBe(400);
    expect(state.updates).toEqual([]);
  });

  it("approving clears the old rejection note and leaves is_open to the vendor", async () => {
    state.row = { ...SHOP_ROW, status: "active", review_note: null };
    const res = await post(shopReview, "shop-1", { status: "active" });
    expect(res.status).toBe(200);
    expect(state.updates[0].patch).toMatchObject({ status: "active", review_note: null });
    expect(state.updates[0].patch).not.toHaveProperty("is_open");
  });

  it("explains a database that has not run the migration", async () => {
    state.error = { code: "PGRST204", message: "Could not find the 'review_note' column" };
    const res = await post(shopReview, "shop-1", { status: "active" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/202609260002_application_review\.sql/);
  });

  it("is admin/super-admin only", () => {
    expect(state.routeOpts).toContainEqual(expect.objectContaining({ roles: ["admin", "super_admin"] }));
  });
});

describe("POST /api/admin/riders/[id]/review", () => {
  it("suspending a rider forces them offline and keeps the staff note", async () => {
    state.row = { ...RIDER_ROW, status: "suspended", review_note: "Cash not settled" };
    const res = await post(riderReview, "rider-1", { status: "suspended", note: "Cash not settled" });
    expect(res.status).toBe(200);
    expect(state.updates[0]).toMatchObject({ table: "riders", id: "rider-1" });
    expect(state.updates[0].patch).toMatchObject({ status: "suspended", is_online: false, review_note: "Cash not settled" });
    const body = (await res.json()) as { rider: { status: string; review?: { note?: string } } };
    expect(body.rider.review?.note).toBe("Cash not settled");
  });

  it("404s when the row is gone", async () => {
    state.error = { code: "PGRST116", message: "0 rows" };
    const res = await post(riderReview, "rider-x", { status: "active" });
    expect(res.status).toBe(404);
  });
});
