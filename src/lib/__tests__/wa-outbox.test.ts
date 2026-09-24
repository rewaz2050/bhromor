/**
 * The free WhatsApp outbox (2026-09-24) — "a draft, not a bot".
 *
 * The owner's question was whether the WhatsApp Business API was needed to
 * message customers at every step. It is not: the API needs a Meta business
 * account, pre-approved templates and ~$0.011 per utility message to
 * Bangladesh, while a `wa.me` link opens the shop's OWN WhatsApp Business app
 * with the text written and a human taps send.
 *
 * What is pinned here:
 *   • the draft text is the SAME copy the push used (one order step, one
 *     sentence, whichever channel carries it) plus an absolute track link;
 *   • a draft is queued only for a plausible BD mobile — a chat link to
 *     nowhere is worse than no button;
 *   • one draft per order per step (`order_no` + `kind`), a second attempt is
 *     reported as `duplicate`, never written again;
 *   • a newer step SUPERSEDES the older pending drafts, so a shopper can never
 *     be sent "order confirmed" after "the rider has your parcel";
 *   • a missing table is named (`202609240003`), not hidden — and it can never
 *     throw into a checkout or a rider's tap.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

interface Log {
  inserted: Row[];
  updated: { patch: Row; filters: Record<string, unknown>[] }[];
  rows: Row[];
  error: { code?: string; message?: string } | null;
}

const state = vi.hoisted(() => ({
  log: {
    inserted: [],
    updated: [],
    rows: [],
    error: null,
  } as unknown as Log,
}));

const matches = (row: Row, filters: Record<string, unknown>[]): boolean =>
  filters.every(({ col, value, mode }) => {
    const field = String(col);
    if (mode === "is-null") return row[field] === null || row[field] === undefined;
    return String(row[field]) === String(value);
  });

vi.mock("@supabase/supabase-js", () => ({}));

const fakeDb = (): unknown => {
  const log = state.log;
  const builder = (table: string) => {
    if (table !== "wa_outbox") {
      return {
        insert: () => ({ error: { message: "wrong table" } }),
        update: () => ({ eq: async () => ({ error: null }) }),
        select: () => ({ is: () => ({ is: () => ({ is: async () => ({ data: [], error: null }) }) }) }),
      };
    }
    return {
      insert: async (row: Row) => {
        if (log.error) return { error: log.error };
        const clash = log.inserted.some(
          (r) => r.order_no === row.order_no && r.kind === row.kind,
        );
        if (clash) return { error: { code: "23505", message: "duplicate key" } };
        log.inserted.push(row);
        return { error: null };
      },
      update: (patch: Row) => {
        const filters: Record<string, unknown>[] = [];
        const chain: Record<string, unknown> = {};
        chain.eq = (col: string, value: unknown) => {
          filters.push({ col, value, mode: "eq" });
          return chain;
        };
        chain.is = (col: string, value: unknown) => {
          filters.push({ col, value, mode: value === null ? "is-null" : "eq" });
          return chain;
        };
        chain.neq = (col: string, value: unknown) => {
          filters.push({ col, value, mode: "neq" });
          return chain;
        };
        chain.then = (ok: unknown, bad: unknown) => {
          log.updated.push({ patch, filters });
          return Promise.resolve({ error: null }).then(ok as never, bad as never);
        };
        return chain;
      },
      select: () => {
        const filters: Record<string, unknown>[] = [];
        const chain: Record<string, unknown> = {};
        const add = (col: string, value: unknown, mode: string) => {
          filters.push({ col, value, mode });
          return chain;
        };
        chain.is = (col: string, value: unknown) => add(col, value, value === null ? "is-null" : "eq");
        chain.eq = (col: string, value: unknown) => add(col, value, "eq");
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.then = (ok: unknown, bad: unknown) =>
          Promise.resolve({
            data: log.error ? null : log.rows.filter((r) => matches(r, filters)),
            error: log.error,
          }).then(ok as never, bad as never);
        return chain;
      },
    };
  };
  return { from: builder };
};

const row = (over: Row = {}): Row => ({
  id: "draft-1",
  order_no: "PS-20260924-0007",
  phone: "01712345678",
  kind: "confirmed",
  lang: "bn",
  message: "x",
  created_at: "2026-09-24T10:00:00.000Z",
  opened_at: null,
  superseded_at: null,
  dismissed_at: null,
  ...over,
});

const load = () => import("@/lib/wa-outbox") as Promise<typeof import("@/lib/wa-outbox")>;

beforeEach(() => {
  state.log.inserted = [];
  state.log.updated = [];
  state.log.rows = [];
  state.log.error = null;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("waDraftText — the same sentence the push would have sent", () => {
  it("carries the push title and body, plus an absolute track link", async () => {
    const { waDraftText } = await load();
    const text = waDraftText({
      kind: "picked-up",
      orderNo: "ps-20260924-0007",
      phone: "01712345678",
      lang: "bn",
    });
    expect(text).toContain("রাইডার আপনার পার্সেল নিয়েছে");
    expect(text).toContain("৪ ডিজিটের কোড");
    // Absolute, because a relative /track inside a chat is meaningless.
    expect(text).toContain("https://");
    expect(text).toContain("/track?id=PS-20260924-0007&phone=01712345678");
    expect(text).toContain("ট্র্যাক করুন");
  });

  it("speaks English for an English shopper", async () => {
    const { waDraftText } = await load();
    const text = waDraftText({
      kind: "preparing",
      orderNo: "PS-1",
      phone: "01712345678",
      lang: "en",
    });
    expect(text).toContain("Being packed");
    expect(text).toContain("Track it");
  });
});

describe("queueWaDraft — one draft per step, never for a number that cannot chat", () => {
  it("stores the step against the order and reports queued", async () => {
    const { queueWaDraft } = await load();
    const outcome = await queueWaDraft(fakeDb() as never, {
      orderNo: "ps-20260924-0007",
      phone: "01712345678",
      kind: "confirmed",
      total: 124000,
    });
    expect(outcome).toBe("queued");
    expect(state.log.inserted).toHaveLength(1);
    expect(state.log.inserted[0]).toMatchObject({
      order_no: "PS-20260924-0007",
      phone: "01712345678",
      kind: "confirmed",
      lang: "bn",
    });
    expect(String(state.log.inserted[0].message)).toContain("অর্ডার কনফার্ম হয়েছে");
    // The total rides along in the copy, like it does on the lock screen.
    expect(String(state.log.inserted[0].message)).toContain("1,240");
  });

  it("refuses a number that is not a BD mobile — the button would go nowhere", async () => {
    const { queueWaDraft } = await load();
    expect(
      await queueWaDraft(fakeDb() as never, { orderNo: "PS-1", phone: "12345", kind: "confirmed" }),
    ).toBe("bad_phone");
    expect(state.log.inserted).toHaveLength(0);
  });

  it("queues each step once — the same step twice is a duplicate, not a second row", async () => {
    const { queueWaDraft } = await load();
    const db = fakeDb() as never;
    expect(await queueWaDraft(db, { orderNo: "PS-1", phone: "01712345678", kind: "confirmed" })).toBe(
      "queued",
    );
    expect(await queueWaDraft(db, { orderNo: "PS-1", phone: "01712345678", kind: "confirmed" })).toBe(
      "duplicate",
    );
    expect(state.log.inserted).toHaveLength(1);
  });

  it("supersedes the older pending draft when a newer step arrives", async () => {
    const { queueWaDraft } = await load();
    await queueWaDraft(fakeDb() as never, {
      orderNo: "PS-1",
      phone: "01712345678",
      kind: "picked-up",
    });
    expect(state.log.updated).toHaveLength(1);
    const [update] = state.log.updated;
    expect(update.patch.superseded_at).toBeTruthy();
    // Only the still-pending drafts of this order, never the new step itself.
    expect(update.filters).toEqual(
      expect.arrayContaining([
        { col: "opened_at", value: null, mode: "is-null" },
        { col: "superseded_at", value: null, mode: "is-null" },
        { col: "dismissed_at", value: null, mode: "is-null" },
      ]),
    );
  });

  it("names the missing migration instead of throwing", async () => {
    const { queueWaDraft, WA_OUTBOX_MIGRATION } = await load();
    state.log.error = { code: "42P01", message: 'relation "wa_outbox" does not exist' };
    expect(
      await queueWaDraft(fakeDb() as never, { orderNo: "PS-1", phone: "01712345678", kind: "confirmed" }),
    ).toBe("missing_table");
    expect(WA_OUTBOX_MIGRATION).toContain("202609240003");
    // A broken database is an "error", and must not be mistaken for the above.
    state.log.error = { code: "57P01", message: "connection reset" };
    expect(
      await queueWaDraft(fakeDb() as never, { orderNo: "PS-1", phone: "01712345678", kind: "confirmed" }),
    ).toBe("error");
  });
});

describe("listWaDrafts / closeWaDraft — the panel's reads and writes", () => {
  it("returns only pending drafts, newest first, and says when the table is missing", async () => {
    const { listWaDrafts } = await load();
    state.log.rows = [
      row({ id: "old", created_at: "2026-09-24T09:00:00.000Z" }),
      row({ id: "sent", kind: "placed", opened_at: "2026-09-24T09:30:00.000Z" }),
      row({ id: "stale", kind: "preparing", superseded_at: "2026-09-24T09:40:00.000Z" }),
      row({ id: "skipped", kind: "ready-for-pickup", dismissed_at: "2026-09-24T09:45:00.000Z" }),
      row({ id: "new", kind: "delivered", created_at: "2026-09-24T11:00:00.000Z" }),
    ];
    const { ready, drafts } = await listWaDrafts(fakeDb() as never, { orderNo: "PS-20260924-0007" });
    expect(ready).toBe(true);
    expect(drafts.map((d) => d.id)).toEqual(["old", "new"]);

    state.log.error = { code: "PGRST205", message: "Could not find the table 'public.wa_outbox'" };
    const missing = await listWaDrafts(fakeDb() as never);
    expect(missing.ready).toBe(false);
    expect(missing.drafts).toEqual([]);
  });

  it("records the open (never a 'sent') and the dismissal", async () => {
    const { closeWaDraft } = await load();
    expect(await closeWaDraft(fakeDb() as never, "draft-1", "opened")).toBe(true);
    expect(state.log.updated[0].patch.opened_at).toBeTruthy();
    expect(state.log.updated[0].patch.dismissed_at).toBeUndefined();
    expect(await closeWaDraft(fakeDb() as never, "draft-1", "dismissed")).toBe(true);
    expect(state.log.updated[1].patch.dismissed_at).toBeTruthy();
    expect(await closeWaDraft(fakeDb() as never, "  ", "opened")).toBe(false);
  });
});

describe("waDraftLink — the one-tap link the panel renders", () => {
  it("builds a wa.me link with the message prefilled and encoded", async () => {
    const { waDraftLink } = await load();
    const link = waDraftLink({ phone: "01712345678", message: "লাইন ১\nলাইন ২" });
    expect(link).toContain("https://wa.me/8801712345678?text=");
    expect(link).toContain(encodeURIComponent("লাইন ১"));
  });

  it("is null when the stored number cannot receive a chat", async () => {
    const { waDraftLink } = await load();
    expect(waDraftLink({ phone: "123", message: "hi" })).toBeNull();
  });
});
