/**
 * The shop's clock (2026-09-24) — `/api/cron/tick`'s brain.
 *
 * What is pinned here is what makes a 96-times-a-day tick safe to leave
 * running with nobody watching:
 *   • a one-shot job is CLAIMED before it runs (the second claim loses) and
 *     the claim is RELEASED when nobody could be reached, so a later opt-in
 *     inside the window still gets the reminder — but nobody gets it twice;
 *   • a missing `cron_marks` table SKIPS the one-shot jobs with a message
 *     naming the migration instead of repeating them every 15 minutes;
 *   • the reminder carries the shop's own window label ("সন্ধ্যায় (৬–৯ PM)"),
 *     not a made-up "soon", and the tracker link proves ownership;
 *   • the digest waits for 9am Dhaka and sends exactly once per Dhaka day,
 *     with the numbers the owner acts on;
 *   • a broken read never throws out of the tick — the report says `failed`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/lib/translations";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  marks: new Set<string>(),
  markInsertError: null as null | { code?: string; message?: string },
  markSelectError: null as null | { code?: string; message?: string },
  deletedMarks: [] as string[],
  upserts: [] as { key: string; ran_at: string }[],
  lastRunRows: [] as { ran_at: string }[],
  /** What pushCustomerMessage was asked to send. */
  pushes: [] as { phone: string | null; build: (lang: Language) => { title: string; body: string; href: string } }[],
  pushAccepted: 1,
  staleOffers: 0,
  expireCalls: 0,
  expireError: null as null | { message: string },
  /** The filter chain of the stale-count read (asserted to use `state`). */
  assignmentsChain: null as { calls: [string, unknown[]][] } | null,
  reminderRows: [] as Record<string, unknown>[],
  digestRows: [] as Record<string, unknown>[],
  digestReadError: null as null | { message: string },
  counts: { todayOrders: 2, openOrders: 3, lowStock: 4, scheduledToday: 5, watches: 6 },
  notices: [] as { title: string; body: string; href?: string | null; kind?: string }[],
}));

vi.mock("@/lib/db/riders", () => ({
  expireStaleAssignments: async () => {
    state.expireCalls += 1;
    if (state.expireError) throw new Error(state.expireError.message);
  },
}));

vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async (_db: unknown, notice: { title: string; body: string }) => {
    state.notices.push(notice);
  },
}));

vi.mock("@/lib/customer-push", () => ({
  pushCustomerMessage: async (
    _db: unknown,
    input: {
      phone: string | null;
      build: (lang: Language) => { title: string; body: string; href: string };
    },
  ) => {
    state.pushes.push({ phone: input.phone, build: input.build });
    // Touch the builder once, the way the real fan-out does per device — a
    // builder that throws must not take the tick down with it.
    input.build("bn");
    return state.pushAccepted;
  },
}));

import {
  CronMarksMissingError,
  claimMark,
  cronStatus,
  releaseMark,
  runCronTick,
} from "../cron";

/* ------------------------------------------------------------------ */
/* A Supabase stand-in: every filter returns the same awaitable chain, */
/* so the test asserts behaviour instead of builder trivia.            */
/* ------------------------------------------------------------------ */

const chain = (result: unknown) => {
  const calls: [string, unknown[]][] = [];
  const obj: Record<string, unknown> = { calls };
  const passthrough = (name: string) => (...args: unknown[]) => {
    calls.push([name, args]);
    return obj;
  };
  for (const name of ["select", "eq", "neq", "not", "in", "gt", "gte", "lt", "lte", "limit", "order"]) {
    obj[name] = passthrough(name);
  }
  const promise = () => Promise.resolve(result);
  obj.then = (onFulfilled: unknown, onRejected: unknown) =>
    promise().then(onFulfilled as never, onRejected as never);
  obj.catch = (onRejected: unknown) => promise().catch(onRejected as never);
  return obj;
};

const fakeService = () =>
  ({
    rpc: async (fn: string) => {
      if (fn !== "ps_expire_stale_offers") return { data: null, error: { message: "unknown rpc" } };
      return { data: null, error: state.expireError };
    },
    from: (name: string) => {
      switch (name) {
        case "delivery_assignments": {
          const assignments = chain({ count: state.staleOffers, error: null });
          state.assignmentsChain = assignments as unknown as { calls: [string, unknown[]][] };
          return { select: () => assignments };
        }
        case "orders":
          return {
            select: (cols: unknown, opts?: { count?: boolean }) => {
              if (opts?.count) {
                // The chain records its own filters, so the answer is decided
                // when the query is awaited (see `countingChain`).
                return countingChain();
              }
              if (String(cols).includes("total")) {
                return chain({ data: state.digestReadError ? null : state.digestRows, error: state.digestReadError });
              }
              return chain({ data: state.reminderRows, error: null });
            },
            insert: async () => ({ error: null }),
          };
        case "products":
          return { select: () => chain({ count: state.counts.lowStock, error: null }) };
        case "price_watches":
        case "stock_watches":
          return { select: () => chain({ count: state.counts.watches, error: null }) };
        case "cron_marks":
          return {
            insert: async (row: { key: string }) => {
              if (state.markInsertError) return { error: state.markInsertError };
              if (state.marks.has(row.key)) {
                return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
              }
              state.marks.add(row.key);
              return { error: null };
            },
            delete: () => {
              const obj: Record<string, unknown> = {};
              obj.eq = async (_col: string, key: string) => {
                state.marks.delete(key);
                state.deletedMarks.push(key);
                return { error: null };
              };
              return obj;
            },
            select: () => chain({ data: state.lastRunRows, error: state.markSelectError }),
            upsert: async (row: { key: string; ran_at: string }) => {
              state.upserts.push(row);
              state.lastRunRows = [{ ran_at: row.ran_at }];
              return { error: null };
            },
          };
        default:
          return { select: () => chain({ data: [], error: null }) };
      }
    },
  }) as unknown as SupabaseClient;

/** A head count whose answer depends on which filters the caller chained. */
const countingChain = () => {
  const result = { count: state.counts.todayOrders, error: null as unknown };
  const obj = chain(result) as Record<string, unknown> & { calls: [string, unknown[]][] };
  const promise = () => {
    const calls = obj.calls;
    const has = (name: string, value?: string) =>
      calls.some(([n, args]) => n === name && (value === undefined || String(args[0]) === value));
    if (has("not", "scheduled_at")) return Promise.resolve({ count: state.counts.scheduledToday, error: null });
    if (has("in", "status")) return Promise.resolve({ count: state.counts.openOrders, error: null });
    return Promise.resolve({ count: state.counts.todayOrders, error: null });
  };
  obj.then = (onFulfilled: unknown, onRejected: unknown) =>
    promise().then(onFulfilled as never, onRejected as never);
  obj.catch = (onRejected: unknown) => promise().catch(onRejected as never);
  return obj;
};

/** 10:00 Dhaka — after the digest hour, so a digest is due. */
const MORNING = new Date("2026-09-24T04:00:00.000Z");
/** 07:00 Dhaka — the shop is not open yet. */
const EARLY = new Date("2026-09-24T01:00:00.000Z");

const jobOf = (
  result: { jobs: { job: string; status: string; did: number; detail: string }[] },
  job: string,
) => result.jobs.find((j) => j.job === job)!;

beforeEach(() => {
  state.marks.clear();
  state.markInsertError = null;
  state.markSelectError = null;
  state.deletedMarks.length = 0;
  state.upserts.length = 0;
  state.lastRunRows = [];
  state.pushes.length = 0;
  state.pushAccepted = 1;
  state.staleOffers = 0;
  state.expireCalls = 0;
  state.expireError = null;
  state.assignmentsChain = null;
  state.reminderRows = [];
  state.digestRows = [];
  state.digestReadError = null;
  state.counts = { todayOrders: 2, openOrders: 3, lowStock: 4, scheduledToday: 5, watches: 6 };
  state.notices = [];
  delete process.env.CRON_SECRET;
});

describe("cron marks", () => {
  it("claims once, and the second claim of the same key loses", async () => {
    const db = fakeService();
    expect(await claimMark(db, "delivery-soon:o1")).toBe(true);
    expect(await claimMark(db, "delivery-soon:o1")).toBe(false);
    expect(state.marks.has("delivery-soon:o1")).toBe(true);
  });

  it("raises CronMarksMissingError for a missing table, and only for that", async () => {
    state.markInsertError = { code: "42P01", message: 'relation "public.cron_marks" does not exist' };
    await expect(claimMark(fakeService(), "x")).rejects.toBeInstanceOf(CronMarksMissingError);
    state.markInsertError = { code: "42501", message: "permission denied" };
    await expect(claimMark(fakeService(), "x")).rejects.toThrow(/claim failed/);
  });

  it("release frees the key so a later tick can try again", async () => {
    const db = fakeService();
    await claimMark(db, "digest:2026-09-24");
    await releaseMark(db, "digest:2026-09-24");
    expect(state.deletedMarks).toEqual(["digest:2026-09-24"]);
    expect(await claimMark(db, "digest:2026-09-24")).toBe(true);
  });
});

describe("expire-offers", () => {
  it("counts the stale offers, then sweeps — and reports how many there were", async () => {
    state.staleOffers = 3;
    const result = await runCronTick({ service: fakeService(), now: MORNING });
    const job = jobOf(result, "expire-offers");
    expect(state.expireCalls).toBe(1);
    expect(job.status).toBe("ran");
    expect(job.did).toBe(3);
    expect(job.detail).toContain("3");
  });

  it("filters the stale count by `state` — the real column (`status` would 42703)", async () => {
    await runCronTick({ service: fakeService(), now: MORNING });
    const eq = state.assignmentsChain?.calls.find(([name]) => name === "eq");
    expect(eq?.[1][0]).toBe("state");
    expect(eq?.[1][1]).toBe("offered");
  });

  it("a failing sweep is reported, not thrown", async () => {
    state.expireError = { message: "ps_expire_stale_offers not installed" };
    const result = await runCronTick({ service: fakeService(), now: MORNING });
    const job = jobOf(result, "expire-offers");
    expect(job.status).toBe("failed");
    expect(job.detail).toContain("not installed");
    // The other jobs still ran — one broken job must not stop the clock.
    expect(jobOf(result, "daily-digest").status).toBe("ran");
  });
});

describe("delivery reminders", () => {
  const scheduled = (ms: number) => new Date(MORNING.getTime() + ms).toISOString();

  it("pushes the shop's own window label ~2 hours ahead, with a track link that proves ownership", async () => {
    state.reminderRows = [
      {
        id: "o1",
        order_no: "PS-20260924-0007",
        customer_phone: "01712345678",
        scheduled_at: scheduled(90 * 60 * 1000),
        delivery_window: "evening",
      },
    ];
    const result = await runCronTick({ service: fakeService(), now: MORNING });

    expect(jobOf(result, "delivery-reminders")).toMatchObject({ status: "ran", did: 1 });
    expect(state.pushes).toHaveLength(1);
    const bn = state.pushes[0].build("bn");
    const en = state.pushes[0].build("en");
    expect(bn.title).toContain("আজ আপনার পার্সেল আসছে");
    expect(bn.body).toContain("PS-20260924-0007");
    expect(bn.body).toContain("সন্ধ্যায় (৬–৯ PM)");
    expect(bn.href).toBe("/track?id=PS-20260924-0007&phone=01712345678");
    // The same message in the shopper's own language, never mixed.
    expect(en.body).toContain("Evening (6–9 PM)");
    expect(en.body).toContain("PS-20260924-0007");
  });

  it("never reminds the same order twice", async () => {
    state.reminderRows = [
      {
        id: "o1",
        order_no: "PS-1",
        customer_phone: "01712345678",
        scheduled_at: scheduled(60 * 60 * 1000),
        delivery_window: "6-8",
      },
    ];
    const first = await runCronTick({ service: fakeService(), now: MORNING });
    expect(jobOf(first, "delivery-reminders").did).toBe(1);
    const second = await runCronTick({ service: fakeService(), now: MORNING });
    expect(jobOf(second, "delivery-reminders")).toMatchObject({ status: "ran", did: 0 });
    expect(jobOf(second, "delivery-reminders").detail).toContain("already reminded");
    expect(state.pushes).toHaveLength(1);
  });

  it("releases the claim when nobody could be reached, so a later opt-in still gets it", async () => {
    state.reminderRows = [
      {
        id: "o1",
        order_no: "PS-1",
        customer_phone: "01712345678",
        scheduled_at: scheduled(60 * 60 * 1000),
        delivery_window: "evening",
      },
    ];
    state.pushAccepted = 0;
    const first = await runCronTick({ service: fakeService(), now: MORNING });
    expect(jobOf(first, "delivery-reminders").did).toBe(0);
    expect(state.deletedMarks).toContain("delivery-soon:o1");
    // They turn notifications on 15 minutes later — the next tick delivers.
    state.pushAccepted = 1;
    const second = await runCronTick({ service: fakeService(), now: MORNING });
    expect(jobOf(second, "delivery-reminders").did).toBe(1);
    expect(state.pushes).toHaveLength(2);
  });

  it("a broken orders read is reported, not thrown", async () => {
    const broken = {
      rpc: async () => ({ data: null, error: null }),
      from: () => ({
        select: () => {
          const obj = chain({ data: null, error: { message: "boom" } });
          return obj;
        },
      }),
    } as unknown as SupabaseClient;
    const result = await runCronTick({ service: broken, now: MORNING });
    expect(jobOf(result, "delivery-reminders").status).toBe("failed");
  });
});

describe("the daily digest", () => {
  it("waits for 9am Dhaka", async () => {
    const result = await runCronTick({ service: fakeService(), now: EARLY });
    expect(jobOf(result, "daily-digest")).toMatchObject({ status: "skipped", did: 0 });
    expect(state.notices).toHaveLength(0);
  });

  it("sends once a Dhaka day, with yesterday's takings and what is piling up", async () => {
    state.digestRows = [
      { total: 120_000, status: "delivered" },
      { total: 55_000, status: "cancelled" },
      { total: 80_000, status: "confirmed" },
    ];
    const first = await runCronTick({ service: fakeService(), now: MORNING });
    expect(jobOf(first, "daily-digest")).toMatchObject({ status: "ran", did: 1 });
    expect(state.notices).toHaveLength(1);
    const notice = state.notices[0];
    expect(notice.title).toContain("সকালের হিসাব");
    // Cancelled rows never inflate the day's takings.
    expect(notice.body).toContain("গতকাল 2টি অর্ডার · ৳2,000");
    expect(notice.body).toContain("খোলা 3টি");
    expect(notice.body).toContain("আজ 5টি সময়-নির্ধারিত ডেলিভারি");
    expect(notice.body).toContain("স্টক কম 4টি পণ্য");
    expect(notice.href).toBe("/admin");

    // 15 minutes later: the day is already counted.
    const second = await runCronTick({ service: fakeService(), now: MORNING });
    expect(jobOf(second, "daily-digest")).toMatchObject({ status: "skipped", did: 0 });
    expect(jobOf(second, "daily-digest").detail).toContain("already sent today");
    expect(state.notices).toHaveLength(1);
  });

  it("says a quiet day out loud instead of inventing cheer", async () => {
    state.digestRows = [];
    state.counts = { todayOrders: 0, openOrders: 0, lowStock: 0, scheduledToday: 0, watches: 0 };
    await runCronTick({ service: fakeService(), now: MORNING });
    const body = state.notices[0].body;
    expect(body).toContain("গতকাল কোনো অর্ডার আসেনি");
    expect(body).toContain("খোলা কিছু নেই ✅");
    expect(body).not.toContain("স্টক কম");
  });
});

describe("when the marks table is missing (migration 202609240002 not run)", () => {
  it("skips the one-shot jobs with the migration name, and still sweeps offers", async () => {
    state.markInsertError = {
      code: "PGRST205",
      message: "Could not find the table 'public.cron_marks' in the schema cache",
    };
    state.staleOffers = 2;
    // An order whose window opens in an hour: without a way to remember "we
    // already said this", the honest move is to stay quiet — not to push it
    // again every 15 minutes.
    state.reminderRows = [
      {
        id: "o1",
        order_no: "PS-1",
        customer_phone: "01712345678",
        scheduled_at: new Date(MORNING.getTime() + 60 * 60 * 1000).toISOString(),
        delivery_window: "evening",
      },
    ];
    const result = await runCronTick({ service: fakeService(), now: MORNING });

    expect(jobOf(result, "expire-offers")).toMatchObject({ status: "ran", did: 2 });
    for (const job of ["delivery-reminders", "daily-digest"]) {
      expect(jobOf(result, job).status).toBe("skipped");
      expect(jobOf(result, job).detail).toContain("202609240002_cron_marks.sql");
    }
    // Nothing was pushed and nobody was told anything twice.
    expect(state.pushes).toHaveLength(0);
    expect(state.notices).toHaveLength(0);
  });
});

describe("the tick report itself", () => {
  it("remembers the run for /api/health", async () => {
    const result = await runCronTick({ service: fakeService(), now: MORNING });
    expect(state.upserts).toEqual([{ key: "cron:last-run", ran_at: result.at }]);

    process.env.CRON_SECRET = "s3cret";
    expect(await cronStatus(fakeService())).toEqual({
      configured: true,
      marksReady: true,
      lastRunAt: result.at,
    });
  });

  it("cronStatus says honestly when the table or the secret is missing", async () => {
    state.markSelectError = { code: "42P01", message: "does not exist" };
    expect(await cronStatus(fakeService())).toEqual({
      configured: false,
      marksReady: false,
      lastRunAt: null,
    });
  });
});
