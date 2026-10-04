import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sent: { endpoint: string; payload: string }[] = [];
const deleted: string[] = [];
let failWith: number | null = null;
let vapid = true;

vi.mock("web-push", () => ({
  default: {
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (failWith && sub.endpoint.includes("dead")) throw Object.assign(new Error("gone"), { statusCode: failWith });
      sent.push({ endpoint: sub.endpoint, payload });
    },
  },
}));
vi.mock("@/lib/push", () => ({
  ensureVapid: () => vapid,
  isPushConfigured: () => vapid,
  publicVapidKey: () => (vapid ? "PUB" : null),
  pushSaveFailureReason: (e: { code?: string } | null) => (e ? (e.code === "42P01" ? "missing_table" : "error") : null),
}));

import {
  newOrderPayload,
  notifyVendorsNewOrders,
  owesPayload,
  pushVendorShops,
  removeVendorSubscription,
  saveVendorSubscription,
} from "../vendor-push";

const makeDb = (rows: { shop_id: string; endpoint: string; p256dh: string; auth: string }[], upsertError: { code?: string } | null = null) => {
  const upserts: unknown[] = [];
  const filters: [string, unknown][] = [];
  const db = {
    from: () => ({
      select: () => ({
        in: (_c: string, ids: string[]) => ({
          limit: async () => ({ data: rows.filter((r) => ids.includes(r.shop_id)), error: null }),
        }),
      }),
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: upsertError };
      },
      delete: () => ({
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          const chain = {
            eq: async (c2: string, v2: unknown) => {
              filters.push([c2, v2]);
              return { error: null };
            },
            then: (res: (v: unknown) => void) => {
              deleted.push(String(v));
              res({ error: null });
            },
          };
          return chain;
        },
      }),
    }),
  } as never;
  return { db, upserts, filters };
};

const row = (shop: string, ep: string) => ({ shop_id: shop, endpoint: `https://push/${ep}`, p256dh: "k", auth: "a" });

beforeEach(() => {
  sent.length = 0;
  deleted.length = 0;
  failWith = null;
  vapid = true;
});

describe("vendor push", () => {
  it("saves only https endpoints with both keys, scoped to the session shop", async () => {
    const { db, upserts } = makeDb([]);
    expect(await saveVendorSubscription(db, "s1", "u1", { endpoint: "http://x", keys: { p256dh: "a", auth: "b" } })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveVendorSubscription(db, "s1", "u1", { endpoint: "https://x", keys: { p256dh: "a" } })).toEqual({ ok: false, reason: "invalid" });
    expect(upserts).toHaveLength(0);
    expect(await saveVendorSubscription(db, "s1", "u1", { endpoint: "https://x", keys: { p256dh: "a", auth: "b" } })).toEqual({ ok: true });
    expect(upserts[0]).toMatchObject({ shop_id: "s1", user_id: "u1", endpoint: "https://x" });
  });

  it("reports a missing table honestly", async () => {
    const { db } = makeDb([], { code: "42P01" });
    expect(await saveVendorSubscription(db, "s1", "u1", { endpoint: "https://x", keys: { p256dh: "a", auth: "b" } })).toEqual({ ok: false, reason: "missing_table" });
  });

  it("removing a device filters by BOTH endpoint and the caller's shop", async () => {
    const { db, filters } = makeDb([]);
    await removeVendorSubscription(db, "s1", "https://x");
    expect(filters).toEqual([["endpoint", "https://x"], ["shop_id", "s1"]]);
  });

  it("pushes only to the named shops' devices", async () => {
    const { db } = makeDb([row("s1", "a"), row("s2", "b")]);
    expect(await pushVendorShops(db, ["s1"], newOrderPayload(1))).toBe(1);
    expect(sent.map((s) => s.endpoint)).toEqual(["https://push/a"]);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ href: "/vendor/orders", urgent: true });
  });

  it("prunes devices the push service reports gone", async () => {
    failWith = 410;
    const { db } = makeDb([row("s1", "dead"), row("s1", "ok")]);
    expect(await pushVendorShops(db, ["s1"], newOrderPayload(1))).toBe(1);
    expect(deleted).toEqual(["https://push/dead"]);
  });

  it("never throws and sends nothing when push is not configured", async () => {
    vapid = false;
    const { db } = makeDb([row("s1", "a")]);
    expect(await pushVendorShops(db, ["s1"], newOrderPayload(1))).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await pushVendorShops({ from: () => { throw new Error("boom"); } } as never, ["s1"], newOrderPayload(1))).toBe(0);
  });

  it("one push per shop however many parcels; ignores missing shop ids", async () => {
    const { db } = makeDb([row("s1", "a"), row("s2", "b")]);
    await notifyVendorsNewOrders(db, ["s1", "s1", "s2", undefined, null]);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent.find((s) => s.endpoint.endsWith("/a"))!.payload).title).toContain("2 new orders");
  });

  it("the owes message names the amount and links to earnings", () => {
    const p = owesPayload(123_456);
    expect(p.body).toContain("1,234.56");
    expect(p.href).toBe("/vendor/earnings");
  });
});
