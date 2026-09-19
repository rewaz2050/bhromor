/**
 * POST /api/track/cancel (UX audit 2026-09-18, P1 #14) — the customer's own
 * cancel, gated exactly like the other track sub-routes (order number +
 * the phone it was placed with) and exactly like the admin's Cancel button
 * (pending / confirmed / preparing only). A wallet payment still under
 * verification is settled as rejected on the way out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  orderRow: null as Record<string, unknown> | null,
  updates: [] as { patch: Record<string, unknown>; statuses: string[] }[],
  history: [] as Record<string, unknown>[],
  notices: [] as Record<string, unknown>[],
  /** Flip to simulate staff moving the order on between read and write. */
  raceAway: false,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({
    from: (table: string) => {
      if (table === "orders") {
        const filters: [string, string][] = [];
        const chain = {
          select: () => chain,
          eq: (col: string, val: string) => {
            filters.push([col, val]);
            return chain;
          },
          maybeSingle: async () => {
            const row = state.orderRow;
            const ok = row && filters.every(([c, v]) => String(row[c] ?? "") === v);
            return { data: ok ? row : null, error: null };
          },
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              in: (_col: string, statuses: string[]) => ({
                select: async () => {
                  state.updates.push({ patch, statuses });
                  const row = state.orderRow!;
                  const current = state.raceAway ? "ready-for-pickup" : String(row.status);
                  return statuses.includes(current)
                    ? { data: [{ id: row.id, status: "cancelled" }], error: null }
                    : { data: [], error: null };
                },
              }),
            }),
          }),
        };
        return chain;
      }
      if (table === "order_status_history") {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.history.push(row);
            return { error: null };
          },
        };
      }
      if (table === "admin_users") {
        return {
          select: () => ({
            in: () => ({
              limit: async () => ({ data: [{ id: "staff-1" }], error: null }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: async (rows: Record<string, unknown>[]) => {
            state.notices.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error("unexpected table: " + table);
    },
  }),
}));

import { POST as cancel } from "../cancel/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const PHONE = "01711111111";
const baseOrder = () => ({
  id: "0f6b3c2e-9a1d-4b7e-8c3a-2d5e6f7a8b9c",
  order_no: "PS-20260918-0007",
  status: "confirmed",
  customer_phone: PHONE,
  payment: "cod",
  payment_status: "verified",
});

const post = (body: unknown): Request =>
  new Request("http://localhost/api/track/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.9" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  __resetRateLimits();
  state.orderRow = baseOrder();
  state.updates = [];
  state.history = [];
  state.notices = [];
  state.raceAway = false;
});

describe("POST /api/track/cancel", () => {
  it("400s without the phone", async () => {
    const res = await cancel(post({ orderId: "PS-20260918-0007" }));
    expect(res.status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it("404s (vaguely) when the phone does not match the order", async () => {
    const res = await cancel(post({ orderId: "PS-20260918-0007", phone: "01799999999" }));
    expect(res.status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });

  it("cancels a confirmed COD order, writes WHO did it, and tells staff", async () => {
    const res = await cancel(post({ orderId: "ps-20260918-0007", phone: PHONE, reason: "ordered twice" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string; paymentRejected: boolean };
    expect(body).toMatchObject({ ok: true, status: "cancelled", paymentRejected: false });
    // Guarded write: only from the customer-cancellable statuses.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].statuses.sort()).toEqual(["confirmed", "pending", "preparing"]);
    expect(state.updates[0].patch).toMatchObject({ status: "cancelled" });
    expect(state.updates[0].patch).not.toHaveProperty("payment_status");
    expect(state.history).toHaveLength(1);
    expect(String(state.history[0].note)).toMatch(/Cancelled by customer/);
    expect(String(state.history[0].note)).toMatch(/ordered twice/);
    expect(state.notices.length).toBeGreaterThan(0);
    expect(String(state.notices[0].title)).toContain("PS-20260918-0007");
  });

  it("settles a pending bKash payment as rejected when the customer cancels", async () => {
    state.orderRow = { ...baseOrder(), status: "pending", payment: "bkash", payment_status: "pending_verification" };
    const res = await cancel(post({ orderId: "PS-20260918-0007", phone: PHONE }));
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ paymentRejected: true });
    expect(state.updates[0].patch).toMatchObject({ status: "cancelled", payment_status: "rejected" });
    expect(state.history).toHaveLength(2);
    expect(String(state.history[1].note)).toMatch(/Payment rejected/);
  });

  it("409s once the parcel is with a rider — no silent no-op", async () => {
    state.orderRow = { ...baseOrder(), status: "out-for-delivery" };
    const res = await cancel(post({ orderId: "PS-20260918-0007", phone: PHONE }));
    expect(res.status).toBe(409);
    expect((await res.json()) as object).toMatchObject({ code: "too_late" });
    expect(state.updates).toHaveLength(0);
  });

  it("409s when staff moved the order on between the read and the write", async () => {
    state.raceAway = true;
    const res = await cancel(post({ orderId: "PS-20260918-0007", phone: PHONE }));
    expect(res.status).toBe(409);
    expect(state.history).toHaveLength(0);
  });

  it("is idempotent for an already-cancelled order", async () => {
    state.orderRow = { ...baseOrder(), status: "cancelled" };
    const res = await cancel(post({ orderId: "PS-20260918-0007", phone: PHONE }));
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ ok: true, already: true });
    expect(state.updates).toHaveLength(0);
  });
});
