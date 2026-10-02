import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listFeedbackForStaff, saveDeliveryFeedback, setFeedbackHidden } from "../delivery-feedback";
import { getRiderRatingSummary } from "../rider-rating";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/** Table → queue of results (one per query); records every call. */
const fake = (tables: Record<string, Result[]>) => {
  const log: string[] = [];
  const patches: Record<string, unknown>[] = [];
  return {
    log, patches,
    db: {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "order", "limit", "is", "lte", "not"]) {
          chain[m] = (...a: unknown[]) => { log.push(`${table}.${m}(${a.map(String).join(",")})`); return chain; };
        }
        chain.update = (p: Record<string, unknown>) => { patches.push(p); log.push(`${table}.update`); return chain; };
        chain.then = (ok: (v: unknown) => unknown) => {
          const q = tables[table] ?? [];
          const r = q.length > 1 ? q.shift()! : q[0] ?? { data: [] };
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(ok);
        };
        return chain;
      },
    } as never,
  };
};

const input = { tags: ["late" as const], comment: "slow" };

describe("saveDeliveryFeedback", () => {
  it("writes once: update guarded by feedback_at is null", async () => {
    const { db, log, patches } = fake({ delivery_ratings: [{ data: [{ rider_id: "r1", stars: 2 }] }] });
    const out = await saveDeliveryFeedback(db, "o1", input, Date.parse("2026-10-02T00:00:00Z"));
    expect(out).toEqual({ status: "saved", riderId: "r1", stars: 2 });
    expect(log).toContain("delivery_ratings.eq(order_id,o1)");
    expect(log).toContain("delivery_ratings.is(feedback_at,null)");
    expect(patches[0]).toEqual({ tags: ["late"], comment: "slow", feedback_at: "2026-10-02T00:00:00.000Z" });
  });
  it("an empty comment is stored as null", async () => {
    const { db, patches } = fake({ delivery_ratings: [{ data: [{ rider_id: "r1", stars: 1 }] }] });
    await saveDeliveryFeedback(db, "o1", { tags: ["rude"], comment: "" });
    expect(patches[0].comment).toBeNull();
  });
  it("tells 'already given' from 'no rating yet'", async () => {
    const already = fake({ delivery_ratings: [{ data: [] }, { data: [{ order_id: "o1" }] }] });
    expect(await saveDeliveryFeedback(already.db, "o1", input)).toEqual({ status: "already" });
    const none = fake({ delivery_ratings: [{ data: [] }, { data: [] }] });
    expect(await saveDeliveryFeedback(none.db, "o1", input)).toEqual({ status: "no-rating" });
  });
  it("unavailable before the migration; real errors throw", async () => {
    const miss = fake({ delivery_ratings: [{ error: { code: "42703", message: "column does not exist" } }] });
    expect(await saveDeliveryFeedback(miss.db, "o1", input)).toEqual({ status: "unavailable" });
    const bad = fake({ delivery_ratings: [{ error: { code: "XX000", message: "boom" } }] });
    await expect(saveDeliveryFeedback(bad.db, "o1", input)).rejects.toThrow("write failed");
  });
});

describe("listFeedbackForStaff", () => {
  const rating = { order_id: "o1", rider_id: "r1", stars: 1, tags: ["late"], comment: "slow", hidden_from_rider: true, feedback_at: "2026-10-01T01:00:00Z", created_at: "2026-10-01T00:00:00Z" };
  it("joins rider + order names and filters by stars / words", async () => {
    const { db, log } = fake({
      delivery_ratings: [{ data: [rating, { ...rating, order_id: "o2", stars: 2, tags: null, comment: null, feedback_at: null, hidden_from_rider: false }] }],
      riders: [{ data: [{ id: "r1", name: "Rafiq" }] }],
      orders: [{ data: [{ id: "o1", order_no: "PS-1" }] }],
    });
    const out = await listFeedbackForStaff(db, { maxStars: 2, onlyWithFeedback: true });
    expect(log).toContain("delivery_ratings.lte(stars,2)");
    expect(log).toContain("delivery_ratings.not(feedback_at,is,null)");
    expect(out?.[0]).toMatchObject({ orderId: "o1", orderNo: "PS-1", riderName: "Rafiq", stars: 1, tags: ["late"], comment: "slow", hidden: true, hasFeedback: true });
    expect(out?.[1]).toMatchObject({ orderNo: "", tags: [], comment: "", hasFeedback: false });
  });
  it("no stars filter at 5; null before the migration", async () => {
    const a = fake({ delivery_ratings: [{ data: [] }] });
    expect(await listFeedbackForStaff(a.db, { maxStars: 5 })).toEqual([]);
    expect(a.log.some((l) => l.includes(".lte("))).toBe(false);
    const b = fake({ delivery_ratings: [{ error: { code: "42P01", message: "does not exist" } }] });
    expect(await listFeedbackForStaff(b.db)).toBeNull();
  });
});

describe("setFeedbackHidden", () => {
  it("true when a row changed, false when no such order, false before the migration", async () => {
    expect(await setFeedbackHidden(fake({ delivery_ratings: [{ data: [{ order_id: "o1" }] }] }).db, "o1", true)).toBe(true);
    expect(await setFeedbackHidden(fake({ delivery_ratings: [{ data: [] }] }).db, "o1", true)).toBe(false);
    expect(await setFeedbackHidden(fake({ delivery_ratings: [{ error: { code: "42703" } }] }).db, "o1", true)).toBe(false);
    await expect(setFeedbackHidden(fake({ delivery_ratings: [{ error: { code: "XX000" } }] }).db, "o1", true)).rejects.toThrow();
  });
});

describe("getRiderRatingSummary — what the rider may read (item X)", () => {
  const NOW = Date.parse("2026-10-02T10:00:00Z");
  const row = (o: Record<string, unknown>) => ({ order_id: "o", stars: 3, created_at: "2026-10-01T00:00:00Z", tags: [], comment: null, hidden_from_rider: false, feedback_at: null, ...o });
  it("shows given, un-hidden feedback with order numbers; hides what staff hid; skips bare stars", async () => {
    const { db } = fake({
      delivery_ratings: [{ data: [
        row({ order_id: "o1", stars: 2, tags: ["late"], comment: "slow", feedback_at: "x" }),
        row({ order_id: "o2", stars: 1, tags: ["rude"], comment: "unfair", feedback_at: "x", hidden_from_rider: true }),
        row({ order_id: "o3", stars: 5 }),
        row({ order_id: "o4", stars: 5, tags: ["polite"], feedback_at: "x" }),
      ] }],
      orders: [{ data: [{ id: "o1", order_no: "PS-1" }, { id: "o4", order_no: "PS-4" }] }],
    });
    const out = await getRiderRatingSummary(db, "r1", NOW);
    expect(out?.feedback).toEqual([
      { stars: 2, at: Date.parse("2026-10-01T00:00:00Z"), orderNo: "PS-1", tags: ["late"], comment: "slow" },
      { stars: 5, at: Date.parse("2026-10-01T00:00:00Z"), orderNo: "PS-4", tags: ["polite"], comment: "" },
    ]);
    expect(JSON.stringify(out)).not.toContain("unfair");
  });
  it("falls back to stars only when the feedback columns are missing", async () => {
    const { db } = fake({
      delivery_ratings: [
        { error: { code: "42703", message: "column delivery_ratings.tags does not exist" } },
        { data: [{ order_id: "o1", stars: 4, created_at: "2026-10-01T00:00:00Z" }] },
      ],
    });
    const out = await getRiderRatingSummary(db, "r1", NOW);
    expect(out?.count).toBe(1);
    expect(out?.feedback).toEqual([]);
  });
});
