/**
 * Rider Web Push (202609250001) — the half that was missing when the owner
 * reported "rider offer paochhe na".
 *
 * Pinned here:
 *   • a device is stored AGAINST the rider whose session asked for it;
 *   • an offer buzzes only that rider's devices, never the staff's;
 *   • `notifyRiderOfOffer` finds the live offer by itself — callers hold
 *     either the row id or the public PS-… order number — and reports the
 *     offer window so the message can say how long the rider has;
 *   • a dead endpoint (404/410) is pruned, and any failure is swallowed:
 *     push is a bonus, the poll stays the source of truth.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  sends: [] as { endpoint: string; payload: string }[],
  sendError: null as null | { statusCode: number },
  deleted: [] as string[],
  upserted: [] as Record<string, unknown>[],
  /** push_subscriptions rows the fake can read back. */
  devices: [] as Record<string, unknown>[],
  /** delivery_assignments rows. */
  assignments: [] as Record<string, unknown>[],
  /** orders rows. */
  orders: [] as Record<string, unknown>[],
  tableError: null as null | { code?: string; message?: string },
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (state.sendError) throw state.sendError;
      state.sends.push({ endpoint: sub.endpoint, payload });
      return {};
    },
  },
}));

/* ------------------------------------------------------------------ */
/* A supabase stand-in whose builder actually filters                  */
/* ------------------------------------------------------------------ */

/**
 * A PostgREST-shaped builder: every filter returns the builder again and the
 * builder is awaitable at any point — which is what lets the production code
 * chain `.order(...).limit(1).maybeSingle()` the way supabase-js allows.
 */
const builder = (rows: () => Record<string, unknown>[], opts?: { head?: boolean }) => {
  let filtered = rows();
  const obj: Record<string, unknown> = {};
  const filter = (name: "eq" | "is" | "in") =>
    (col: string, value: unknown) => {
      filtered = filtered.filter((r) => {
        if (name === "eq") return String(r[col] ?? "") === String(value);
        if (name === "is") return (r[col] ?? null) === value;
        return Array.isArray(value) && value.includes(r[col]);
      });
      return obj;
    };
  obj.eq = filter("eq");
  obj.is = filter("is");
  obj.in = filter("in");
  obj.order = () => obj;
  obj.limit = () => obj;
  obj.range = () => obj;
  obj.maybeSingle = () => {
    obj.singleMode = "maybe";
    return obj;
  };
  obj.single = () => {
    obj.singleMode = "one";
    return obj;
  };
  const resolve = () => {
    if (opts?.head) {
      return { data: null, count: filtered.length, error: state.tableError };
    }
    if (obj.singleMode) {
      return { data: filtered[0] ?? null, error: state.tableError };
    }
    return { data: filtered, error: state.tableError };
  };
  obj.then = (onF: unknown, onR: unknown) =>
    Promise.resolve(resolve()).then(onF as never, onR as never);
  obj.catch = (onR: unknown) => Promise.resolve(resolve()).catch(onR as never);
  return obj;
};

const fakeDb = () =>
  ({
    from: (name: string) => {
      if (name === "push_subscriptions") {
        return {
          select: (_cols?: unknown, opts?: { head?: boolean }) =>
            builder(() => state.devices, opts),
          upsert: async (row: Record<string, unknown>) => {
            state.upserted.push(row);
            return { error: state.tableError };
          },
          delete: () => {
            const conds: Record<string, unknown> = {};
            const obj: Record<string, unknown> = {};
            const apply = () => {
              const before = state.devices.length;
              // Every chained condition must match for the row to go.
              state.devices = state.devices.filter((d) =>
                Object.entries(conds).every(
                  ([k, v]) => String(d[k] ?? "") === String(v),
                ),
              ) ? [] : state.devices.filter((d) =>
                !Object.entries(conds).every(
                  ([k, v]) => String(d[k] ?? "") === String(v),
                ),
              );
              void before;
              if (typeof conds.endpoint === "string") {
                state.deleted.push(conds.endpoint);
              }
            };
            obj.eq = (col: string, value: unknown) => {
              conds[col] = value;
              return obj;
            };
            obj.then = (onF: unknown, onR: unknown) => {
              apply();
              return Promise.resolve({ error: null }).then(onF as never, onR as never);
            };
            return obj;
          },
        };
      }
      if (name === "delivery_assignments") {
        return { select: () => builder(() => state.assignments) };
      }
      if (name === "orders") {
        return { select: () => builder(() => state.orders) };
      }
      return { select: () => builder(() => []) };
    },
  }) as unknown as SupabaseClient;

const setVapid = (on: boolean) => {
  if (on) {
    process.env.PUSH_VAPID_PUBLIC_KEY = "BTestPublicKey_ShapeOnly";
    process.env.PUSH_VAPID_PRIVATE_KEY = "test-private-key";
  } else {
    delete process.env.PUSH_VAPID_PUBLIC_KEY;
    delete process.env.PUSH_VAPID_PRIVATE_KEY;
  }
};

const freshRiderPush = () =>
  import("@/lib/rider-push") as Promise<typeof import("@/lib/rider-push")>;

beforeEach(() => {
  vi.resetModules();
  setVapid(true);
  state.sends.length = 0;
  state.sendError = null;
  state.deleted.length = 0;
  state.upserted.length = 0;
  state.devices = [];
  state.assignments = [];
  state.orders = [];
  state.tableError = null;
});

describe("saving a rider device", () => {
  it("stores the endpoint against the rider whose session asked", async () => {
    const push = await freshRiderPush();
    const saved = await push.saveRiderPushSubscription(fakeDb(), "rider-1", {
      endpoint: "https://push/r1",
      keys: { p256dh: "k", auth: "a" },
    });
    expect(saved).toEqual({ ok: true });
    expect(state.upserted[0]).toMatchObject({
      endpoint: "https://push/r1",
      rider_id: "rider-1",
    });
  });

  it("refuses a subscription without both keys or a plain-http endpoint", async () => {
    const push = await freshRiderPush();
    expect(
      await push.saveRiderPushSubscription(fakeDb(), "rider-1", {
        endpoint: "http://push/r1",
        keys: { p256dh: "k", auth: "a" },
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await push.saveRiderPushSubscription(fakeDb(), "rider-1", {
        endpoint: "https://push/r1",
        keys: { p256dh: "", auth: "a" },
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(state.upserted).toHaveLength(0);
  });

  it("names the missing migration when the table or column is not there", async () => {
    state.tableError = { code: "42703", message: "column rider_id does not exist" };
    const push = await freshRiderPush();
    const saved = await push.saveRiderPushSubscription(fakeDb(), "rider-1", {
      endpoint: "https://push/r1",
      keys: { p256dh: "k", auth: "a" },
    });
    expect(saved).toEqual({ ok: false, reason: "missing_table" });
  });
});

describe("buzzing one rider about an offer", () => {
  it("sends only to THAT rider's devices", async () => {
    const push = await freshRiderPush();
    state.devices = [
      { endpoint: "https://push/r1", p256dh: "k", auth: "a", rider_id: "rider-1" },
      { endpoint: "https://push/r2", p256dh: "k", auth: "a", rider_id: "rider-2" },
      { endpoint: "https://push/staff", p256dh: "k", auth: "a" },
    ];
    const { sent } = await push.pushRiderOffer(fakeDb(), "rider-1", {
      orderNo: "PS-77",
      area: "Sadar",
      totalLabel: "৳1060",
      windowSeconds: 300,
    });
    expect(sent).toBe(1);
    expect(state.sends.map((s) => s.endpoint)).toEqual(["https://push/r1"]);
    const payload = JSON.parse(state.sends[0].payload) as { title: string; body: string; href: string };
    expect(payload.title).toContain("PS-77");
    expect(payload.body).toContain("5 min");
    expect(payload.href).toBe("/rider");
  });

  it("is an honest no-op with no VAPID keys and no device", async () => {
    setVapid(false);
    const push = await freshRiderPush();
    state.devices = [
      { endpoint: "https://push/r1", p256dh: "k", auth: "a", rider_id: "rider-1" },
    ];
    expect(await push.pushRiderOffer(fakeDb(), "rider-1", { orderNo: "PS-1", area: "", totalLabel: "" })).toEqual({
      sent: 0,
    });
    expect(state.sends).toHaveLength(0);
  });

  it("prunes a device the push service reports gone (410)", async () => {
    const push = await freshRiderPush();
    state.devices = [
      { endpoint: "https://push/dead", p256dh: "k", auth: "a", rider_id: "rider-1" },
    ];
    state.sendError = { statusCode: 410 };
    const { sent } = await push.pushRiderOffer(fakeDb(), "rider-1", {
      orderNo: "PS-1",
      area: "",
      totalLabel: "",
    });
    expect(sent).toBe(0);
    expect(state.deleted).toEqual(["https://push/dead"]);
  });
});

describe("notifyRiderOfOffer — the one call every dispatch path makes", () => {
  beforeEach(() => {
    state.assignments = [
      {
        id: "a-1",
        order_id: "11111111-1111-1111-1111-111111111111",
        rider_id: "rider-1",
        state: "offered",
        offered_at: "2026-09-25T04:00:00.000Z",
        expires_at: "2026-09-25T04:10:00.000Z",
      },
    ];
    state.orders = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        order_no: "PS-20260925-0001",
        area: "Sadar",
        total: 106000,
      },
    ];
    state.devices = [
      { endpoint: "https://push/r1", p256dh: "k", auth: "a", rider_id: "rider-1" },
    ];
  });

  it("resolves a ROW ID and buzzes with the real offer window", async () => {
    const push = await freshRiderPush();
    const { sent } = await push.notifyRiderOfOffer(
      fakeDb(),
      "11111111-1111-1111-1111-111111111111",
    );
    expect(sent).toBe(1);
    const payload = JSON.parse(state.sends[0].payload) as { title: string; body: string };
    expect(payload.title).toContain("PS-20260925-0001");
    // 10 minutes between offered_at and expires_at, read back from the row.
    expect(payload.body).toContain("10 min");
    expect(payload.body).toContain("৳1060");
  });

  it("resolves a PUBLIC order number the same way (the vendor path)", async () => {
    const push = await freshRiderPush();
    const { sent } = await push.notifyRiderOfOffer(fakeDb(), "ps-20260925-0001");
    expect(sent).toBe(1);
    expect(state.sends[0].endpoint).toBe("https://push/r1");
  });

  it("sends nothing when the order has no live offer", async () => {
    const push = await freshRiderPush();
    state.assignments = [];
    expect(
      await push.notifyRiderOfOffer(fakeDb(), "11111111-1111-1111-1111-111111111111"),
    ).toEqual({ sent: 0 });
  });

  it("never throws at the caller when the read fails", async () => {
    const push = await freshRiderPush();
    state.tableError = { code: "42P01", message: 'relation "orders" does not exist' };
    await expect(
      push.notifyRiderOfOffer(fakeDb(), "11111111-1111-1111-1111-111111111111"),
    ).resolves.toEqual({ sent: 0 });
  });
});
