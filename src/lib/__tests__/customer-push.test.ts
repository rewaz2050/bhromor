/**
 * Shopper Web Push (2026-09-24) — the fan-out that gives a customer an
 * automatic channel for the first time.
 *
 * What is pinned here:
 *   • the milestone map: three useful pushes per parcel, not eight — the
 *     internal states (preparing, ready-for-pickup, courier-assigned) are the
 *     shop's business and must stay silent;
 *   • a payload per language, so a Bangla shopper is not pushed English;
 *   • the tracker link carries the order id AND phone (the tracker's proof);
 *   • dead endpoints (404/410) are pruned, live ones are left alone;
 *   • everything is a no-op without VAPID keys, and nothing ever throws.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendCalls: { endpoint: string; payload: string; ttl?: number }[] = [];
let sendError: { statusCode: number } | null = null;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (
      sub: { endpoint: string },
      payload: string,
      opts?: { TTL?: number },
    ) => {
      if (sendError) throw sendError;
      sendCalls.push({ endpoint: sub.endpoint, payload, ttl: opts?.TTL });
      return {};
    },
  },
}));

type Row = Record<string, unknown>;

/** What the fake client records, so tests can assert the wiring. */
interface TableLog {
  rows: Row[];
  upserted: Row[];
  deleted: string[];
  queries: { col: string; value: string }[];
}

const table = (over: Partial<TableLog> = {}): TableLog => ({
  rows: [],
  upserted: [],
  deleted: [],
  queries: [],
  ...over,
});

const fakeDb = (log: TableLog) =>
  ({
    from: (name: string) => ({
      upsert: async (row: Row) => {
        if (name !== "customer_push_subscriptions") return { error: { message: "wrong table" } };
        log.upserted.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (col: string, endpoint: string) => {
          log.queries.push({ col, value: endpoint });
          log.deleted.push(endpoint);
          return { error: null };
        },
      }),
      select: () => ({
        eq: (col: string, value: string) => ({
          limit: async () => {
            log.queries.push({ col, value });
            return { data: log.rows, error: null };
          },
        }),
        // The batched watch fan-out reads many phones in one `in`, and
        // `subscribedPhones` awaits the builder without a `.limit()`.
        in: (col: string, values: string[]) => {
          values.forEach((value) => log.queries.push({ col, value }));
          const data = log.rows.filter((r) => values.includes(String(r[col])));
          const result = { data, error: null };
          return {
            limit: async () => result,
            then: (onFulfilled: unknown, onRejected: unknown) =>
              Promise.resolve(result).then(onFulfilled as never, onRejected as never),
            catch: (onRejected: unknown) => Promise.resolve(result).catch(onRejected as never),
          };
        },
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

/** push.ts/customer-push.ts cache the VAPID setup per process. */
const freshPush = () =>
  import("@/lib/customer-push") as Promise<typeof import("@/lib/customer-push")>;

const row = (over: Row = {}): Row => ({
  endpoint: "https://push/phone",
  p256dh: "k",
  auth: "a",
  phone: "01712345678",
  lang: "bn",
  ...over,
});

beforeEach(() => {
  sendCalls.length = 0;
  sendError = null;
  vi.resetModules();
  setVapid(true);
});

describe("customer push — subscription storage", () => {
  it("validates a subscription (https + keys + phone) and upserts with last_seen_at", async () => {
    const push = await freshPush();
    const log = table();
    const db = fakeDb(log);

    expect(
      await push.saveCustomerPushSubscription(db, {
        endpoint: "http://insecure",
        keys: { p256dh: "k", auth: "a" },
        phone: "01712345678",
      }),
    ).toEqual({ ok: false, reason: "invalid" });

    expect(
      await push.saveCustomerPushSubscription(db, {
        endpoint: "https://push/x",
        keys: { p256dh: "k" },
        phone: "01712345678",
      }),
    ).toEqual({ ok: false, reason: "invalid" });

    // No phone → nothing to bind the order updates to.
    expect(
      await push.saveCustomerPushSubscription(db, {
        endpoint: "https://push/x",
        keys: { p256dh: "k", auth: "a" },
        phone: "  ",
      }),
    ).toEqual({ ok: false, reason: "invalid" });

    expect(
      await push.saveCustomerPushSubscription(db, {
        endpoint: "https://push/x",
        keys: { p256dh: "k", auth: "a" },
        phone: "01712345678",
      }),
    ).toEqual({ ok: true });
    expect(log.upserted).toHaveLength(1);
    expect(log.upserted[0]).toMatchObject({
      endpoint: "https://push/x",
      phone: "01712345678",
      lang: "bn",
    });
    expect(typeof log.upserted[0].last_seen_at).toBe("string");
  });

  it("tells a missing table apart from a bad request (migration 202609240001)", async () => {
    const push = await freshPush();
    expect(push.customerPushSaveFailureReason(null)).toBeNull();
    expect(push.customerPushSaveFailureReason({ code: "42P01" })).toBe("missing_table");
    expect(
      push.customerPushSaveFailureReason({
        message: "Could not find the table 'public.customer_push_subscriptions' in the schema cache",
      }),
    ).toBe("missing_table");
    expect(push.customerPushSaveFailureReason({ code: "23505" })).toBe("error");

    const deadDb = {
      from: () => ({
        upsert: async () => ({ error: { code: "42P01", message: "does not exist" } }),
        select: async () => ({ count: null, error: { code: "42P01", message: "does not exist" } }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    expect(
      await push.saveCustomerPushSubscription(deadDb, {
        endpoint: "https://push/x",
        keys: { p256dh: "k", auth: "a" },
        phone: "01712345678",
      }),
    ).toEqual({ ok: false, reason: "missing_table" });
    expect(await push.customerPushReady(deadDb)).toEqual({ ready: false, count: 0 });
  });
});

describe("customer push — milestones", () => {
  it("stays silent for the internal states a shopper should never be told about", async () => {
    const push = await freshPush();
    const log = table({ rows: [row()] });
    for (const status of ["pending", "preparing", "ready-for-pickup", "courier-assigned"] as const) {
      expect(
        await push.notifyCustomerOfStatus(fakeDb(log), {
          phone: "01712345678",
          orderNo: "PS-1",
          status,
        }),
      ).toBe(0);
    }
    expect(sendCalls).toHaveLength(0);
  });

  it("pushes the four public milestones with the tracker link and the total", async () => {
    const push = await freshPush();
    const log = table({ rows: [row()] });

    await push.notifyCustomerOfStatus(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-20260924-0007",
      status: "confirmed",
      total: 124000,
    });
    await push.notifyCustomerOfStatus(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-20260924-0007",
      status: "out-for-delivery",
      total: 124000,
    });
    await push.notifyCustomerOfStatus(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-20260924-0007",
      status: "delivered",
      total: 124000,
    });
    await push.notifyCustomerOrderPlaced(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-20260924-0007",
      total: 124000,
    });
    await push.notifyCustomerOfPayment(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-20260924-0007",
      total: 124000,
    });
    await push.notifyCustomerOfStatus(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-20260924-0007",
      status: "cancelled",
    });

    expect(sendCalls).toHaveLength(6);
    const payloads = sendCalls.map((c) => JSON.parse(c.payload) as { title: string; body: string; href: string });
    expect(payloads[0].title).toBe("অর্ডার কনফার্ম হয়েছে");
    expect(payloads[1].title).toContain("রাইডার");
    expect(payloads[2].title).toContain("ডেলিভারি");
    expect(payloads[3].title).toBe("অর্ডার পেয়েছি ✅");
    expect(payloads[4].title).toContain("পেমেন্ট ভেরিফাই");
    expect(payloads[5].title).toBe("অর্ডার বাতিল হয়েছে");
    for (const p of payloads) {
      expect(p.body).toContain("PS-20260924-0007");
      expect(p.href).toBe(
        "/track?id=PS-20260924-0007&phone=01712345678",
      );
    }
    expect(sendCalls[0].ttl).toBe(3600);
    // The fan-out is keyed on the order's phone — never a broadcast.
    expect(log.queries.every((q) => q.col === "phone" && q.value === "01712345678")).toBe(true);
  });

  it("speaks the language the shopper was reading", async () => {
    const push = await freshPush();
    const log = table({
      rows: [
        row({ endpoint: "https://push/bn", lang: "bn" }),
        row({ endpoint: "https://push/en", lang: "en" }),
      ],
    });
    await push.notifyCustomerOfStatus(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-9",
      status: "delivered",
      total: 50000,
    });
    const byEndpoint = new Map(
      sendCalls.map((c) => [c.endpoint, JSON.parse(c.payload) as { title: string; body: string }]),
    );
    expect(byEndpoint.get("https://push/bn")?.title).toContain("ডেলিভারি");
    expect(byEndpoint.get("https://push/en")?.title).toBe("Delivered 🎉");
    // Money is in the body, in taka — never in the title (lock screens crop).
    expect(byEndpoint.get("https://push/en")?.body).toContain("৳500");
  });

  it("is an honest no-op without VAPID keys, and when nobody opted in", async () => {
    const log = table({ rows: [row()] });

    setVapid(false);
    const noKeys = await freshPush();
    expect(noKeys.isCustomerPushConfigured()).toBe(false);
    expect(noKeys.customerVapidKey()).toBeNull();
    expect(
      await noKeys.notifyCustomerOfStatus(fakeDb(log), {
        phone: "01712345678",
        orderNo: "PS-1",
        status: "delivered",
      }),
    ).toBe(0);
    expect(sendCalls).toHaveLength(0);

    setVapid(true);
    const empty = await freshPush();
    expect(
      await empty.notifyCustomerOfStatus(fakeDb(table()), {
        phone: "01712345678",
        orderNo: "PS-1",
        status: "delivered",
      }),
    ).toBe(0);
    // No phone on the order (legacy row) → nothing sent, nothing thrown.
    expect(
      await empty.notifyCustomerOfStatus(fakeDb(log), {
        phone: "",
        orderNo: "PS-1",
        status: "delivered",
      }),
    ).toBe(0);
    expect(sendCalls).toHaveLength(0);
  });

  it("prunes the dead devices a push service reports gone (404/410) and keeps the live ones", async () => {
    const push = await freshPush();
    const log = table({ rows: [row({ endpoint: "https://push/dead" })] });
    sendError = { statusCode: 410 };
    const sent = await push.notifyCustomerOfStatus(fakeDb(log), {
      phone: "01712345678",
      orderNo: "PS-1",
      status: "delivered",
    });
    expect(sent).toBe(0);
    expect(log.deleted).toEqual(["https://push/dead"]);
  });
});

/**
 * The other half of "the shop calls everyone": a watcher whose phone is
 * subscribed hears the price drop or the restock instantly, and only the
 * numbers that could NOT be reached stay on the staff call list (2026-09-24).
 */
describe("customer push — watch fan-out (price drop / back in stock)", () => {
  it("reads every watcher's phone in one query and pushes to each of them", async () => {
    const push = await freshPush();
    const log = table({
      rows: [
        row({ endpoint: "https://push/a", phone: "01711111111" }),
        row({ endpoint: "https://push/b", phone: "01822222222" }),
      ],
    });
    const result = await push.pushProductEvent(fakeDb(log), {
      phones: ["01711111111", "01822222222", "01999999999"],
      kind: "price-drop",
      productName: "Black Panjabi",
      pricePaisa: 124000,
      href: "/product/black-panjabi",
    });

    expect(result.accepted).toBe(2);
    // 01999999999 has no device — the caller keeps it on the call list.
    expect(result.reached.sort()).toEqual(["01711111111", "01822222222"]);
    expect(result.devices).toBe(2);
    // One batched read, not one per phone.
    expect(log.queries.map((q) => q.value)).toEqual([
      "01711111111",
      "01822222222",
      "01999999999",
    ]);
    const payload = JSON.parse(sendCalls[0].payload) as { body: string; href: string };
    expect(payload.body).toContain("Black Panjabi");
    expect(payload.href).toBe("/product/black-panjabi");
  });

  it("speaks each device's own language and prunes the dead ones", async () => {
    const push = await freshPush();
    const log = table({
      rows: [
        row({ endpoint: "https://push/bn", phone: "01711111111", lang: "bn" }),
        row({ endpoint: "https://push/en", phone: "01711111111", lang: "en" }),
        row({ endpoint: "https://push/gone", phone: "01822222222" }),
      ],
    });
    const result = await push.pushProductEvent(fakeDb(log), {
      phones: ["01711111111", "01822222222"],
      kind: "back-in-stock",
      productName: "Black Panjabi",
      pricePaisa: 124000,
    });
    // Three devices, two phones: both phones heard it (one per language).
    expect(result.accepted).toBe(3);
    expect(result.reached.sort()).toEqual(["01711111111", "01822222222"]);
    const byEndpoint = new Map(
      sendCalls.map((c) => [c.endpoint, JSON.parse(c.payload) as { title: string }]),
    );
    expect(byEndpoint.get("https://push/bn")?.title).toContain("স্টকে ফিরে");
    expect(byEndpoint.get("https://push/en")?.title).toBe("Back in stock ✅");

    sendError = { statusCode: 404 };
    const dead = await push.pushProductEvent(fakeDb(log), {
      phones: ["01822222222"],
      kind: "price-drop",
      productName: "X",
    });
    expect(dead.accepted).toBe(0);
    expect(dead.reached).toEqual([]);
    expect(log.deleted).toContain("https://push/gone");
  });

  it("is an honest no-op without VAPID keys or without any number to call", async () => {
    const log = table({ rows: [row()] });
    setVapid(false);
    const noKeys = await freshPush();
    expect(
      await noKeys.pushProductEvent(fakeDb(log), {
        phones: ["01712345678"],
        kind: "price-drop",
        productName: "X",
      }),
    ).toEqual({ accepted: 0, devices: 0, reached: [] });
    expect(sendCalls).toHaveLength(0);

    setVapid(true);
    const ok = await freshPush();
    expect(
      await ok.pushProductEvent(fakeDb(log), { phones: [], kind: "price-drop", productName: "X" }),
    ).toEqual({ accepted: 0, devices: 0, reached: [] });
    // A missing table is a no-op too — the staff call list stays intact.
    expect(
      await ok.pushProductEvent(fakeDb(table()), {
        phones: ["01712345678"],
        kind: "price-drop",
        productName: "X",
      }),
    ).toEqual({ accepted: 0, devices: 0, reached: [] });
  });

  it("subscribedPhones answers which numbers have a device, without sending anything", async () => {
    const push = await freshPush();
    const log = table({
      rows: [row({ phone: "01711111111" }), row({ endpoint: "https://push/b", phone: "01822222222" })],
    });
    const phones = await push.subscribedPhones(fakeDb(log), [
      "01711111111",
      "01822222222",
      "01711111111",
      "01999999999",
    ]);
    expect([...phones].sort()).toEqual(["01711111111", "01822222222"]);
    expect(sendCalls).toHaveLength(0);
    // Deduped before the query: three unique numbers, not four.
    expect(log.queries.map((q) => q.value)).toEqual(["01711111111", "01822222222", "01999999999"]);
  });
});
