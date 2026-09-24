/**
 * /api/admin/wa-outbox — the free WhatsApp draft queue (2026-09-24).
 *
 * Two things matter here and nowhere else:
 *   • staff-only: the table is service-role only, so the session check is the
 *     gate (and a missing session must never reach the service client);
 *   • honest when the migration was never run — `ready: false` plus the file
 *     name, because an empty queue and a missing table must not look alike.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  serviceAvailable: true,
  list: { ready: true, drafts: [] as Record<string, unknown>[] },
  closed: [] as { id: string; action: string }[],
  listCalls: [] as unknown[],
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => (state.serviceAvailable ? { fake: true } : null),
}));

vi.mock("@/lib/wa-outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wa-outbox")>("@/lib/wa-outbox");
  return {
    ...actual,
    listWaDrafts: async (_db: unknown, options: unknown) => {
      state.listCalls.push(options);
      return state.list;
    },
    closeWaDraft: async (_db: unknown, id: string, action: string) => {
      state.closed.push({ id, action });
      return id !== "ghost";
    },
  };
});

vi.mock("@/lib/staff-auth", () => ({
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: null }),
}));

import { GET, POST } from "../admin/wa-outbox/route";

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/wa-outbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const draft = {
  id: "d1",
  orderNo: "PS-20260924-0007",
  phone: "01712345678",
  kind: "confirmed",
  lang: "bn",
  message: "অর্ডার কনফার্ম হয়েছে ✅\nPS-20260924-0007 …",
  createdAt: "2026-09-24T10:00:00.000Z",
};

beforeEach(() => {
  state.serviceAvailable = true;
  state.list = { ready: true, drafts: [draft] };
  state.closed = [];
  state.listCalls = [];
});

describe("GET /api/admin/wa-outbox", () => {
  it("returns the queue with a server-built chip label and one-tap link", async () => {
    const res = await GET(new Request("http://localhost/api/admin/wa-outbox?order=PS-1&limit=5"));
    const body = (await res.json()) as {
      ready: boolean;
      drafts: { label: string; link: string | null }[];
    };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(state.listCalls[0]).toEqual({ orderNo: "PS-1", limit: 5 });
    expect(body.drafts[0].label).toBe("কনফার্ম");
    expect(body.drafts[0].link).toContain("https://wa.me/8801712345678?text=");
  });

  it("names the migration when the table is missing instead of showing empty", async () => {
    state.list = { ready: false, drafts: [] };
    const body = (await (
      await GET(new Request("http://localhost/api/admin/wa-outbox"))
    ).json()) as { ready: boolean; migration?: string; drafts: unknown[] };
    expect(body.ready).toBe(false);
    expect(body.migration).toBe("supabase/migrations/202609240003_wa_outbox.sql");
    expect(body.drafts).toEqual([]);
  });

  it("503s when the service key is not configured", async () => {
    state.serviceAvailable = false;
    expect((await GET(new Request("http://localhost/api/admin/wa-outbox"))).status).toBe(503);
  });
});

describe("POST /api/admin/wa-outbox", () => {
  it("records the open (never a claim that it was sent)", async () => {
    const res = await POST(post({ id: "d1", action: "opened" }));
    expect(res.status).toBe(200);
    expect(state.closed).toEqual([{ id: "d1", action: "opened" }]);
  });

  it("records a dismissal", async () => {
    await POST(post({ id: "d1", action: "dismissed" }));
    expect(state.closed).toEqual([{ id: "d1", action: "dismissed" }]);
  });

  it("422s an unknown action or a missing id", async () => {
    expect((await POST(post({ id: "d1", action: "sent" }))).status).toBe(422);
    expect((await POST(post({ action: "opened" }))).status).toBe(422);
    expect(state.closed).toEqual([]);
  });

  it("422s when the row could not be updated", async () => {
    expect((await POST(post({ id: "ghost", action: "opened" }))).status).toBe(422);
  });
});
