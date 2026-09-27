/**
 * UX plan §5 (R10) — the abandoned bag, server half:
 *   • a snapshot is kept ONLY for a device that opted in to offers push;
 *   • the scheduler reminds once, 24–72 h after the last touch, and stamps
 *     the row even when nobody could be reached (never a retry-nag);
 *   • a device that opted out in between is closed without a push;
 *   • the copy counts in Bengali digits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  sends: [] as { endpoint: string; title: string }[],
  accepted: 1,
}));

vi.mock("@/lib/customer-push", async () => {
  const actual = await vi.importActual<typeof import("@/lib/customer-push")>("@/lib/customer-push");
  return {
    ...actual,
    sendToDevices: async (
      _db: unknown,
      subs: { endpoint: string }[],
      build: (lang: "bn" | "en") => { title: string },
    ) => {
      for (const s of subs) state.sends.push({ endpoint: s.endpoint, title: build("bn").title });
      return state.accepted;
    },
  };
});

import {
  BAG_REMIND_AFTER_MS,
  BAG_REMIND_GAP_MS,
  bagReminderMessage,
  runAbandonedBags,
  saveBagSnapshot,
} from "../abandoned-bag";

const H = 60 * 60 * 1000;
const NOW = Date.parse("2026-09-27T10:00:00.000Z");

/** Minimal builder double: filters pass through, terminals resolve `result`. */
const chain = (result: unknown) => {
  const obj: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "gte", "lte", "in", "limit", "order"]) obj[m] = () => obj;
  obj.maybeSingle = async () => result;
  obj.then = (ok: unknown, ko: unknown) => Promise.resolve(result).then(ok as never, ko as never);
  return obj;
};

const makeDb = (opts: {
  subs: Record<string, unknown>[];
  bags: Record<string, unknown>[];
  bagError?: { code?: string; message: string } | null;
}) => {
  const upserts: Record<string, unknown>[] = [];
  const stamps: { endpoint: string; reminded_at: string }[] = [];
  const db = {
    from: (table: string) => {
      if (table === "customer_push_subscriptions") {
        return {
          select: () => ({
            eq: (_c: string, endpoint: string) => ({
              maybeSingle: async () => ({ data: opts.subs.find((s) => s.endpoint === endpoint) ?? null, error: null }),
            }),
            in: (_c: string, endpoints: string[]) => ({
              eq: (_m: string, marketing: boolean) =>
                chain({
                  data: opts.subs.filter((s) => endpoints.includes(String(s.endpoint)) && s.marketing === marketing),
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "bag_snapshots") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            upserts.push(row);
            return { error: opts.bagError ?? null };
          },
          select: () => chain({ data: opts.bagError ? null : opts.bags, error: opts.bagError ?? null }),
          update: (patch: { reminded_at: string }) => ({
            eq: async (_c: string, endpoint: string) => {
              stamps.push({ endpoint, reminded_at: patch.reminded_at });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { db, upserts, stamps };
};

const optedIn = { endpoint: "https://push.example/a", p256dh: "k", auth: "a", phone: "01711111111", lang: "bn", marketing: true };
const optedOut = { ...optedIn, endpoint: "https://push.example/b", marketing: false };

beforeEach(() => {
  state.sends.length = 0;
  state.accepted = 1;
});
afterEach(() => vi.restoreAllMocks());

describe("saveBagSnapshot", () => {
  it("stores the bag for an opted-in device, clamps and cleans the fields", async () => {
    const { db, upserts } = makeDb({ subs: [optedIn], bags: [] });
    const res = await saveBagSnapshot(db, {
      endpoint: optedIn.endpoint,
      count: "2",
      subtotal: 125000.7,
      topName: "  Forest Panjabi ",
      topSlug: "forest-panjabi?x=1",
      lang: "en",
    });
    expect(res).toEqual({ ok: true, stored: true });
    expect(upserts[0]).toMatchObject({ endpoint: optedIn.endpoint, count: 2, subtotal: 125000, top_name: "Forest Panjabi", top_slug: "forest-panjabix1", lang: "en" });
  });

  it("keeps nothing for a device without the offers opt-in, and rejects a non-https endpoint", async () => {
    const { db, upserts } = makeDb({ subs: [optedOut], bags: [] });
    expect(await saveBagSnapshot(db, { endpoint: optedOut.endpoint, count: 1, subtotal: 1 })).toEqual({ ok: true, stored: false });
    expect(await saveBagSnapshot(db, { endpoint: "https://push.example/unknown", count: 1, subtotal: 1 })).toEqual({ ok: true, stored: false });
    expect(await saveBagSnapshot(db, { endpoint: "http://x", count: 1, subtotal: 1 })).toEqual({ ok: false, reason: "invalid" });
    expect(upserts).toHaveLength(0);
  });

  it("names the migration when the table is missing", async () => {
    const { db } = makeDb({ subs: [optedIn], bags: [], bagError: { code: "42P01", message: "relation does not exist" } });
    expect(await saveBagSnapshot(db, { endpoint: optedIn.endpoint, count: 1, subtotal: 1 })).toEqual({ ok: false, reason: "missing_table" });
  });
});

describe("runAbandonedBags", () => {
  const bag = (o: Record<string, unknown>) => ({
    endpoint: optedIn.endpoint,
    count: 2,
    subtotal: 125000,
    top_name: "Forest Panjabi",
    lang: "bn",
    touched_at: new Date(NOW - BAG_REMIND_AFTER_MS - H).toISOString(),
    reminded_at: null,
    ...o,
  });

  it("pushes once to the opted-in device and stamps the row", async () => {
    const { db, stamps } = makeDb({ subs: [optedIn], bags: [bag({})] });
    const run = await runAbandonedBags(db, NOW);
    expect(run).toMatchObject({ status: "ran", did: 1 });
    expect(state.sends).toEqual([{ endpoint: optedIn.endpoint, title: "আপনার ব্যাগে ২টি পিস অপেক্ষা করছে" }]);
    expect(stamps).toEqual([{ endpoint: optedIn.endpoint, reminded_at: new Date(NOW).toISOString() }]);
  });

  it("skips a device reminded within 7 days, closes an opted-out one without a push, stamps even when nobody accepted", async () => {
    const recent = bag({ reminded_at: new Date(NOW - BAG_REMIND_GAP_MS + H).toISOString() });
    const old = bag({ endpoint: optedOut.endpoint, reminded_at: new Date(NOW - BAG_REMIND_GAP_MS - H).toISOString() });
    const { db, stamps } = makeDb({ subs: [optedIn, optedOut], bags: [recent, old] });
    const run = await runAbandonedBags(db, NOW);
    expect(run).toMatchObject({ status: "ran", did: 0 });
    expect(state.sends).toEqual([]);
    expect(stamps.map((s) => s.endpoint)).toEqual([optedOut.endpoint]);

    state.accepted = 0;
    const flaky = makeDb({ subs: [optedIn], bags: [bag({})] });
    const second = await runAbandonedBags(flaky.db, NOW);
    expect(second).toMatchObject({ status: "ran", did: 0 });
    expect(flaky.stamps).toHaveLength(1);
  });

  it("reports the missing table as skipped, with the file name", async () => {
    const { db } = makeDb({ subs: [], bags: [], bagError: { code: "PGRST205", message: "Could not find the table" } });
    const run = await runAbandonedBags(db, NOW);
    expect(run.status).toBe("skipped");
    expect(run.detail).toContain("202609270003_bag_snapshots.sql");
  });
});

describe("bagReminderMessage", () => {
  it("counts in Bengali digits, names the top piece and lands on the bag", () => {
    const bn = bagReminderMessage({ count: 3, subtotal: 250000, topName: "Forest Panjabi" }, "bn");
    expect(bn.title).toBe("আপনার ব্যাগে ৩টি পিস অপেক্ষা করছে");
    expect(bn.body).toContain("Forest Panjabi ও আরও");
    expect(bn.body).toContain("৳");
    expect(bn.href).toBe("/cart");
    const en = bagReminderMessage({ count: 1, subtotal: 250000, topName: "" }, "en");
    expect(en.title).toBe("One piece is waiting in your bag");
  });
});
