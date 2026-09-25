/**
 * Staff Web Push — the pipeline that lets an order buzz the owner's phone
 * with the panel closed: config honesty, subscription validation, fan-out
 * with dead-subscription pruning, and a 404/410 prune.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendCalls: { endpoint: string; payload: string }[] = [];
let sendError: { statusCode: number } | null = null;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (sendError) throw sendError;
      sendCalls.push({ endpoint: sub.endpoint, payload });
      return {};
    },
  },
}));

type Row = Record<string, unknown>;

/** Tiny fake supabase client for the push_subscriptions table. */
const fakeDb = (table: { rows: Row[]; upserted: Row[]; deleted: string[] }) =>
  ({
    from: (name: string) => ({
      upsert: async (row: Row) => {
        if (name !== "push_subscriptions") return { error: { message: "wrong table" } };
        table.upserted.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, endpoint: string) => {
          table.deleted.push(endpoint);
          return { error: null };
        },
      }),
      select: () => ({
        limit: async () => ({ data: table.rows, error: null }),
      }),
    }),
  }) as unknown as import("@supabase/supabase-js").SupabaseClient;

const setVapid = (on: boolean) => {
  if (on) {
    process.env.PUSH_VAPID_PUBLIC_KEY = "BTestPublicKey_ShapeOnly";
    process.env.PUSH_VAPID_PRIVATE_KEY = "test-private-key";
  } else {
    delete process.env.PUSH_VAPID_PUBLIC_KEY;
    delete process.env.PUSH_VAPID_PRIVATE_KEY;
  }
};

/** Fresh module per test — push.ts caches the VAPID setup per process. */
const freshPush = () =>
  import("@/lib/push") as Promise<typeof import("@/lib/push")>;

beforeEach(() => {
  sendCalls.length = 0;
  sendError = null;
  vi.resetModules();
  setVapid(true);
});

describe("staff web push", () => {
  it("is an honest no-op without VAPID keys — config report and fan-out both", async () => {
    setVapid(false);
    const push = await freshPush();
    expect(push.isPushConfigured()).toBe(false);
    expect(push.publicVapidKey()).toBeNull();

    const table = { rows: [{ endpoint: "https://push/x", p256dh: "k", auth: "a" }], upserted: [], deleted: [] };
    await push.pushStaffNotice(fakeDb(table), { kind: "order", title: "New order" });
    expect(sendCalls).toHaveLength(0); // nothing sent, nothing thrown
  });

  it("validates subscriptions — https endpoint + both keys, else rejected", async () => {
    const push = await freshPush();
    const table = { rows: [], upserted: [], deleted: [] };
    const db = fakeDb(table);

    await expect(push.savePushSubscription(db, { endpoint: "http://insecure", keys: { p256dh: "k", auth: "a" } })).resolves.toBe(false);
    await expect(push.savePushSubscription(db, { endpoint: "https://push/ok", keys: { p256dh: "k" } })).resolves.toBe(false);
    await expect(
      push.savePushSubscription(db, { endpoint: "https://push/ok", keys: { p256dh: "k", auth: "a" } }),
    ).resolves.toBe(true);
    expect(table.upserted).toHaveLength(1);

    await push.removePushSubscription(db, "https://push/ok");
    expect(table.deleted).toEqual(["https://push/ok"]);
  });

  it("fans a staff notice out to every device with title/body/href payload", async () => {
    const push = await freshPush();
    const table = {
      rows: [
        { endpoint: "https://push/phone", p256dh: "k1", auth: "a1" },
        { endpoint: "https://push/tab", p256dh: "k2", auth: "a2" },
      ],
      upserted: [],
      deleted: [],
    };
    await push.pushStaffNotice(fakeDb(table), {
      kind: "order",
      title: "New order PS-12",
      body: "৳1,240 · COD",
      href: "/admin/orders/ps-12",
    });
    expect(sendCalls.map((c) => c.endpoint)).toEqual(["https://push/phone", "https://push/tab"]);
    const payload = JSON.parse(sendCalls[0].payload) as { title: string; href: string };
    expect(payload.title).toBe("New order PS-12");
    expect(payload.href).toBe("/admin/orders/ps-12");
    expect(table.deleted).toEqual([]); // nothing pruned — all delivered
  });

  it("tells a missing device table apart from a malformed subscription (503 vs 422)", async () => {
    const push = await freshPush();
    // Migration 202609210001 never pasted → PostgREST's shapes for one thing.
    expect(push.pushSaveFailureReason(null)).toBeNull();
    expect(push.pushSaveFailureReason({ code: "42P01" })).toBe("missing_table");
    expect(push.pushSaveFailureReason({ code: "PGRST205" })).toBe("missing_table");
    expect(
      push.pushSaveFailureReason({ message: 'relation "public.push_subscriptions" does not exist' }),
    ).toBe("missing_table");
    expect(
      push.pushSaveFailureReason({ message: "Could not find the table 'public.push_subscriptions' in the schema cache" }),
    ).toBe("missing_table");
    // A bad request stays a bad request.
    expect(push.pushSaveFailureReason({ code: "23505", message: "duplicate key" })).toBe("error");

    const deadDb = {
      from: () => ({
        upsert: async () => ({ error: { code: "42P01", message: "does not exist" } }),
        select: async () => ({ count: null, error: { code: "42P01", message: "does not exist" } }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    expect(
      await push.savePushSubscriptionResult(deadDb, { endpoint: "https://push/x", keys: { p256dh: "k", auth: "a" } }),
    ).toEqual({ ok: false, reason: "missing_table" });
    expect(await push.pushSubscriptionsReady(deadDb)).toEqual({ ready: false, count: 0 });
  });

  it("prunes subscriptions the push service reports gone (404/410)", async () => {
    const push = await freshPush();
    const table = {
      rows: [
        { endpoint: "https://push/dead", p256dh: "k1", auth: "a1" },
        { endpoint: "https://push/alive", p256dh: "k2", auth: "a2" },
      ],
      upserted: [],
      deleted: [],
    };
    sendError = { statusCode: 410 };
    // The fake throws for every endpoint — both get pruned, nothing throws out.
    await push.pushStaffNotice(fakeDb(table), { kind: "system", title: "n" });
    expect(table.deleted).toEqual(["https://push/dead", "https://push/alive"]);
  });
});
