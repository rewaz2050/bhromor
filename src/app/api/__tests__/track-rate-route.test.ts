/**
 * Delivery rating loop (202609250008):
 *   - POST /api/track/rate — phone-verified, delivered-only, 1–5 stars,
 *     idempotent per order (a re-tap never skews the average);
 *   - applyDeliveryRating — the rider's average recomputed from the table.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findOwnedOrder = vi.fn<(id: string, phone: string, cols: string) => Promise<unknown>>();
vi.mock("@/lib/db/order-lookup", () => ({
  findOwnedOrder: (id: string, phone: string, cols: string) =>
    findOwnedOrder(id, phone, cols),
}));

const applyDeliveryRating = vi.fn<(service: unknown, riderId: string) => Promise<void>>(
  async () => undefined,
);
vi.mock("@/lib/db/riders", () => ({
  applyDeliveryRating: (service: unknown, riderId: string) =>
    applyDeliveryRating(service, riderId),
}));

vi.mock("@/lib/env", () => ({ isServiceRoleConfigured: () => true }));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterSec: 1 }),
  clientIpFromHeaders: () => "127.0.0.1",
}));

const insert = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({ from: () => ({ insert }) }),
}));

import { POST as ratePost } from "../track/rate/route";

const post = (body: unknown): Request =>
  new Request("http://localhost/api/track/rate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const deliveredOrder = {
  id: "order-uuid-1",
  status: "delivered",
  rider_id: "rider-uuid-1",
  customer_phone: "01711111111",
};

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  applyDeliveryRating.mockClear();
  findOwnedOrder.mockReset();
});

describe("POST /api/track/rate", () => {
  it("422s stars outside 1–5", async () => {
    for (const stars of [0, 6, 3.5, "four"]) {
      const res = await ratePost(post({ id: "PS-1", phone: "01711111111", stars }));
      expect(res.status).toBe(422);
    }
    expect(findOwnedOrder).not.toHaveBeenCalled();
  });

  it("404s a wrong order/phone — vague on purpose", async () => {
    findOwnedOrder.mockResolvedValueOnce(null);
    const res = await ratePost(post({ id: "PS-1", phone: "01700000000", stars: 5 }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Order not found.");
  });

  it("409s before delivery", async () => {
    findOwnedOrder.mockResolvedValueOnce({ ...deliveredOrder, status: "out-for-delivery" });
    const res = await ratePost(post({ id: "PS-1", phone: "01711111111", stars: 5 }));
    expect(res.status).toBe(409);
  });

  it("records the rating, rolls the rider average, answers ok", async () => {
    findOwnedOrder.mockResolvedValueOnce(deliveredOrder);
    const res = await ratePost(post({ id: "PS-1", phone: "01711111111", stars: 5 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; already?: boolean };
    expect(body).toMatchObject({ ok: true, already: false });
    expect(insert).toHaveBeenCalledWith({
      order_id: "order-uuid-1",
      rider_id: "rider-uuid-1",
      stars: 5,
    });
    expect(applyDeliveryRating).toHaveBeenCalledWith(expect.anything(), "rider-uuid-1");
  });

  it("answers already:true on a second rating — never an error", async () => {
    findOwnedOrder.mockResolvedValueOnce(deliveredOrder);
    insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    const res = await ratePost(post({ id: "PS-1", phone: "01711111111", stars: 4 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already?: boolean };
    expect(body.already).toBe(true);
    // The average must NOT be recomputed from a rejected insert.
    expect(applyDeliveryRating).not.toHaveBeenCalled();
  });
});
