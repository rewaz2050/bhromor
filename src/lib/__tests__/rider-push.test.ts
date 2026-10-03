/**
 * Rider Web Push (item I): offers → the rider's closed-app phone.
 * Pinned here: claim-before-send (no double buzz), one push per rider, TTL =
 * what is left of the offer, riders without a device are left alone, dead
 * endpoints are pruned, and everything is a quiet no-op without keys / the
 * migration. Nothing ever throws.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sends: { endpoint: string; payload: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
let sendError: { statusCode: number } | null = null;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string, opts: Record<string, unknown>) => {
      if (sendError) throw sendError;
      sends.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts });
      return {};
    },
  },
}));

import {
  offerPushPayload,
  pushPendingRiderOffers,
  pushRiderAnnouncement,
  removeRiderSubscription,
  resetRiderPushThrottle,
  riderPushStatus,
  saveRiderSubscription,
} from "../rider-push";

type Row = Record<string, unknown>;
const NOW = Date.parse("2026-10-02T10:00:00Z");
const inSec = (s: number) => new Date(NOW + s * 1000).toISOString();

interface World {
  assignments: Row[];
  subs: Row[];
  /** What a concurrent sweep already took: ids that come back un-claimed. */
  raceLost: Set<string>;
  claimedIds: string[];
  deletedEndpoints: string[];
  upserts: Row[];
  deleteFilters: Record<string, unknown>[];
  assignmentsError: { code?: string; message: string } | null;
  subsError: { code?: string; message: string } | null;
  claimError: { code?: string; message: string } | null;
}
let world: World;

/** A chainable fake: records filters, resolves on await. */
const builder = (resolve: (f: Record<string, unknown>) => unknown) => {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "gt", "limit", "in", "update", "delete", "order"]) {
    chain[m] = (...args: unknown[]) => {
      if (m === "eq") filters[`eq:${String(args[0])}`] = args[1];
      if (m === "in") filters[`in:${String(args[0])}`] = args[1];
      if (m === "update") filters.update = args[0];
      if (m === "delete") filters.delete = true;
      return chain;
    };
  }
  chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    Promise.resolve(resolve(filters)).then(ok, bad);
  return chain;
};

const fakeDb = () =>
  ({
    from: (name: string) => {
      if (name === "delivery_assignments") {
        return builder((f) => {
          if (f.update) {
            if (world.claimError) return { data: null, error: world.claimError };
            const ids = (f["in:id"] as string[]).filter((id) => !world.raceLost.has(id));
            world.claimedIds.push(...ids);
            return { data: world.assignments.filter((a) => ids.includes(a.id as string)), error: null };
          }
          if (world.assignmentsError) return { data: null, error: world.assignmentsError };
          return { data: world.assignments, error: null };
        });
      }
      if (name === "rider_push_subscriptions") {
        const b = builder((f) => {
          if (f.delete) {
            world.deleteFilters.push(f);
            if (typeof f["eq:endpoint"] === "string") world.deletedEndpoints.push(f["eq:endpoint"] as string);
            return { error: null };
          }
          if (world.subsError) return { data: null, count: null, error: world.subsError };
          const riderIds = f["in:rider_id"] as string[] | undefined;
          const only = f["eq:rider_id"] as string | undefined;
          const rows = world.subs.filter((s) => (riderIds ? riderIds.includes(s.rider_id as string) : only ? s.rider_id === only : true));
          return { data: rows, count: rows.length, error: null };
        });
        (b as Record<string, unknown>).upsert = async (row: Row) => {
          world.upserts.push(row);
          return { error: null };
        };
        return b;
      }
      throw new Error(`unexpected table ${name}`);
    },
  }) as never;

const sub = (rider: string, n = 1): Row => ({ rider_id: rider, endpoint: `https://push.example/${rider}/${n}`, p256dh: "k", auth: "a" });
const offer = (id: string, rider: string, order: string, secs = 80): Row => ({ id, rider_id: rider, order_id: order, expires_at: inSec(secs) });

beforeEach(() => {
  process.env.PUSH_VAPID_PUBLIC_KEY = "pub";
  process.env.PUSH_VAPID_PRIVATE_KEY = "priv";
  sends.length = 0;
  sendError = null;
  resetRiderPushThrottle();
  world = {
    assignments: [], subs: [], raceLost: new Set(), claimedIds: [], deletedEndpoints: [], upserts: [], deleteFilters: [],
    assignmentsError: null, subsError: null, claimError: null,
  };
});

describe("pushPendingRiderOffers", () => {
  it("claims the offer, then pushes ONE urgent message per rider with the time left as TTL", async () => {
    world.assignments = [offer("a1", "r1", "o1", 80), offer("a2", "r1", "o2", 60), offer("a3", "r2", "o3", 90)];
    world.subs = [sub("r1", 1), sub("r1", 2), sub("r2")];
    const out = await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true });
    expect(out).toEqual({ claimed: 3, riders: 2 });
    expect(world.claimedIds.sort()).toEqual(["a1", "a2", "a3"]);
    // r1: two devices × one message (2 offers); r2: one device
    expect(sends).toHaveLength(3);
    const r1 = sends.filter((s) => s.endpoint.includes("/r1/"));
    expect(r1).toHaveLength(2);
    expect(r1[0].payload).toMatchObject({ title: "🔔 2টি নতুন ডেলিভারি অফার", href: "/rider", tag: "rider-offers", urgent: true, renotify: true, skipIfFocused: true });
    expect(r1[0].opts).toMatchObject({ TTL: 60, urgency: "high" }); // the SOONEST expiry of that rider's offers
    expect(sends.find((s) => s.endpoint.includes("/r2/"))!.payload.title).toBe("🔔 নতুন ডেলিভারি অফার");
  });

  it("never puts customer or order details in the payload", async () => {
    world.assignments = [offer("a1", "r1", "ORDER-SECRET-1")];
    world.subs = [sub("r1")];
    await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true });
    expect(JSON.stringify(sends[0].payload)).not.toContain("ORDER-SECRET-1");
  });

  it("leaves offers of riders with no device untouched (no claim, no send)", async () => {
    world.assignments = [offer("a1", "r1", "o1"), offer("a2", "r9", "o2")];
    world.subs = [sub("r1")];
    const out = await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true });
    expect(out.claimed).toBe(1);
    expect(world.claimedIds).toEqual(["a1"]);
  });

  it("a concurrent sweep that already claimed an offer means no second buzz", async () => {
    world.assignments = [offer("a1", "r1", "o1")];
    world.subs = [sub("r1")];
    world.raceLost.add("a1");
    const out = await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true });
    expect(out).toMatchObject({ claimed: 0, riders: 0 });
    expect(sends).toHaveLength(0);
  });

  it("prunes a dead endpoint (410) and counts the rider as not reached", async () => {
    world.assignments = [offer("a1", "r1", "o1")];
    world.subs = [sub("r1")];
    sendError = { statusCode: 410 };
    const out = await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true });
    expect(out.riders).toBe(0);
    expect(world.deletedEndpoints).toEqual(["https://push.example/r1/1"]);
  });

  it("a flaky push service (500) keeps the device registered", async () => {
    world.assignments = [offer("a1", "r1", "o1")];
    world.subs = [sub("r1")];
    sendError = { statusCode: 500 };
    await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true });
    expect(world.deletedEndpoints).toEqual([]);
  });

  it("is throttled for the poll-driven path but force bypasses it", async () => {
    world.assignments = [offer("a1", "r1", "o1")];
    world.subs = [sub("r1")];
    expect((await pushPendingRiderOffers(fakeDb(), { nowMs: NOW })).claimed).toBe(1);
    expect((await pushPendingRiderOffers(fakeDb(), { nowMs: NOW + 2000 })).skipped).toBe("throttled");
    expect((await pushPendingRiderOffers(fakeDb(), { nowMs: NOW + 2000, force: true })).claimed).toBe(1);
  });

  it("without VAPID keys it does nothing and touches no table", async () => {
    delete process.env.PUSH_VAPID_PUBLIC_KEY;
    delete process.env.PUSH_VAPID_PRIVATE_KEY;
    // module-level VAPID state is per-process; a fresh import sees the new env
    vi.resetModules();
    const fresh = await import("../rider-push");
    const throwing = { from: () => { throw new Error("must not be called"); } } as never;
    expect((await fresh.pushPendingRiderOffers(throwing, { force: true })).skipped).toBe("unconfigured");
  });

  it("skips quietly when migration 202610020004 has not run (missing column / table)", async () => {
    world.assignmentsError = { code: "42703", message: "column push_notified_at does not exist" };
    expect((await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true })).skipped).toBe("missing_migration");
    world.assignmentsError = null;
    world.assignments = [offer("a1", "r1", "o1")];
    world.subsError = { code: "42P01", message: 'relation "rider_push_subscriptions" does not exist' };
    expect((await pushPendingRiderOffers(fakeDb(), { nowMs: NOW, force: true })).skipped).toBe("missing_migration");
    expect(world.claimedIds).toEqual([]);
  });

  it("never throws, even when the client blows up", async () => {
    const boom = { from: () => { throw new Error("db down"); } } as never;
    await expect(pushPendingRiderOffers(boom, { force: true })).resolves.toMatchObject({ claimed: 0 });
  });

  it("offer text carries the seconds left and never promises less than 10", () => {
    expect(offerPushPayload(1, 75).body).toContain("75 সেকেন্ড");
    expect(offerPushPayload(1, 2).body).toContain("10 সেকেন্ড");
  });
});

describe("subscriptions", () => {
  it("saves only a valid https endpoint with both keys, bound to the given rider", async () => {
    expect(await saveRiderSubscription(fakeDb(), "r1", { endpoint: "http://x", keys: { p256dh: "k", auth: "a" } })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveRiderSubscription(fakeDb(), "r1", { endpoint: "https://x/1", keys: { p256dh: "k" } })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveRiderSubscription(fakeDb(), "r1", { endpoint: "https://x/1", keys: { p256dh: "k", auth: "a" } })).toEqual({ ok: true });
    expect(world.upserts[0]).toMatchObject({ rider_id: "r1", endpoint: "https://x/1" });
  });

  it("a rider can only remove their own device", async () => {
    await removeRiderSubscription(fakeDb(), "r1", "https://x/1");
    expect(world.deleteFilters[0]).toMatchObject({ "eq:endpoint": "https://x/1", "eq:rider_id": "r1" });
    await removeRiderSubscription(fakeDb(), "r1", "");
    expect(world.deleteFilters).toHaveLength(1);
  });

  it("status reports this rider's device count and whether the table exists", async () => {
    world.subs = [sub("r1", 1), sub("r1", 2), sub("r2")];
    expect(await riderPushStatus(fakeDb(), "r1")).toMatchObject({ configured: true, tableReady: true, count: 2 });
    world.subsError = { code: "42P01", message: "does not exist" };
    expect((await riderPushStatus(fakeDb(), "r1")).tableReady).toBe(false);
  });
});

describe("pushRiderAnnouncement", () => {
  it("targets one rider, or everyone, and marks important ones urgent", async () => {
    world.subs = [sub("r1"), sub("r2")];
    expect(await pushRiderAnnouncement(fakeDb(), { riderId: "r1", title: "Settle by 8pm", body: "Please", important: true })).toBe(1);
    expect(sends[0].payload).toMatchObject({ title: "❗ Settle by 8pm", href: "/rider/inbox", urgent: true });
    sends.length = 0;
    expect(await pushRiderAnnouncement(fakeDb(), { riderId: null, title: "Rain today", body: "", important: false })).toBe(2);
    expect(sends[0].payload).toMatchObject({ title: "📢 Rain today", urgent: false });
  });

  it("is silent when nobody has a device", async () => {
    expect(await pushRiderAnnouncement(fakeDb(), { riderId: null, title: "x", body: "", important: false })).toBe(0);
  });
});
