/**
 * The track sub-routes use the same ownership proof as /api/track:
 * order ID + the phone the order was placed with. The order ID is guessable
 * (PS-YYYYMMDD-XXXX), so the phone check is what keeps a stranger out —
 * these tests pin that gate on both the rider-location read and the
 * reschedule write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  orderRow: null as Record<string, unknown> | null,
  riderRow: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  history: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({
    from: (table: string) => {
      if (table === "orders") {
        return {
          select: () => ({
            or: () => ({
              single: async () => ({
                data: state.orderRow,
                error: state.orderRow ? null : { message: "PGRST116: row not found" },
              }),
            }),
          }),
          update: (val: Record<string, unknown>) => ({
            eq: async () => {
              state.updates.push(val);
              return { error: null };
            },
          }),
        };
      }
      if (table === "riders") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: state.riderRow,
                error: state.riderRow ? null : { message: "PGRST116: row not found" },
              }),
            }),
          }),
        };
      }
      if (table === "order_status_history") {
        return {
          insert: (row: Record<string, unknown>) => {
            state.history.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error("unexpected table: " + table);
    },
  }),
}));

import { GET as riderLocation } from "../rider-location/route";
import { POST as reschedule } from "../reschedule/route";

const ORDER_PHONE = "01711111111";
const ORDER = {
  id: "uuid-1",
  status: "out-for-delivery",
  rider_id: "rider-1",
  customer_phone: ORDER_PHONE,
};

const post = (body: unknown): Request =>
  new Request("http://localhost/api/track/reschedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.orderRow = null;
  state.riderRow = null;
  state.updates = [];
  state.history = [];
});

describe("GET /api/track/rider-location (phone-gated)", () => {
  it("400s without the phone", async () => {
    const res = await riderLocation(
      new Request("http://localhost/api/track/rider-location?orderId=PS-1"),
    );
    expect(res.status).toBe(400);
  });

  it("404s when the order does not exist", async () => {
    const res = await riderLocation(
      new Request(
        `http://localhost/api/track/rider-location?orderId=PS-1&phone=${ORDER_PHONE}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("404s on a phone mismatch — indistinguishable from a wrong id", async () => {
    state.orderRow = ORDER;
    const res = await riderLocation(
      new Request(
        "http://localhost/api/track/rider-location?orderId=PS-1&phone=01899999999",
      ),
    );
    expect(res.status).toBe(404);
  });

  it("404s while no rider is assigned yet", async () => {
    state.orderRow = { ...ORDER, rider_id: null };
    const res = await riderLocation(
      new Request(
        `http://localhost/api/track/rider-location?orderId=PS-1&phone=${ORDER_PHONE}`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("refuses to leak a position before the rider is on the way", async () => {
    state.orderRow = { ...ORDER, status: "pending" };
    const res = await riderLocation(
      new Request(
        `http://localhost/api/track/rider-location?orderId=PS-1&phone=${ORDER_PHONE}`,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns the real coordinates to the owner of the order", async () => {
    state.orderRow = ORDER;
    state.riderRow = {
      lat: 25.1234,
      lng: 91.0567,
      last_location_at: "2026-09-14T12:00:00Z",
      is_online: true,
    };
    const res = await riderLocation(
      new Request(
        `http://localhost/api/track/rider-location?orderId=PS-1&phone=${ORDER_PHONE}`,
      ),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { lat: number; lng: number };
    expect(data.lat).toBeCloseTo(25.1234);
    expect(data.lng).toBeCloseTo(91.0567);
  });
});

describe("POST /api/track/reschedule (phone-gated)", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    orderId: "PS-1",
    phone: ORDER_PHONE,
    scheduled_at: "2026-09-15T14:00:00",
    delivery_window: "2-4",
    ...over,
  });

  it("400s without the phone", async () => {
    const res = await reschedule(post({ orderId: "PS-1" }));
    expect(res.status).toBe(400);
  });

  it("400s on an unknown delivery window", async () => {
    const res = await reschedule(post(body({ delivery_window: "0-0" })));
    expect(res.status).toBe(400);
  });

  it("400s on a malformed time", async () => {
    const res = await reschedule(post(body({ scheduled_at: "whenever" })));
    expect(res.status).toBe(400);
  });

  it("404s on a phone mismatch — indistinguishable from a wrong id", async () => {
    state.orderRow = ORDER;
    const res = await reschedule(
      post(body({ phone: "01899999999" })),
    );
    expect(res.status).toBe(404);
  });

  it("refuses delivered and cancelled orders", async () => {
    state.orderRow = { ...ORDER, status: "delivered" };
    expect((await reschedule(post(body()))).status).toBe(400);
    state.orderRow = { ...ORDER, status: "cancelled" };
    expect((await reschedule(post(body()))).status).toBe(400);
  });

  it("reschedules for the owner and records the history note", async () => {
    state.orderRow = { ...ORDER, status: "preparing" };
    const res = await reschedule(post(body()));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(state.updates.length).toBe(1);
    expect(state.updates[0].scheduled_at).toBe("2026-09-15T14:00:00");
    expect(state.updates[0].delivery_window).toBe("2-4");
    expect(state.history.length).toBe(1);
    expect(state.history[0].note).toMatch(/rescheduled by customer/i);
  });
});
