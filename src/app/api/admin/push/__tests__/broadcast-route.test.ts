/**
 * /api/admin/push/broadcast — the weekly drops & offers push (UX plan §12):
 * seven-day gate from the newest row, honest 409 when nobody opted in,
 * the migration named when the table is missing, and a real fan-out row.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  lastSentAt: null as string | null,
  tableMissing: false,
  subs: [] as { endpoint: string; p256dh: string; auth: string; phone: string; lang: string }[],
  inserted: [] as Record<string, unknown>[],
  sent: [] as string[],
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (_sub: unknown, payload: string) => {
      state.sent.push(payload);
    },
  },
}));

vi.mock("@/lib/staff-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-auth")>("@/lib/staff-auth");
  return {
    ...actual,
    requireStaffRole: async () => ({ user: { id: "u1", email: "owner@x.com" }, role: "admin", db: {} }),
    requireStaff: async () => ({ user: { id: "u1", email: "owner@x.com" }, role: "admin", db: {} }),
  };
});

const MISSING = { code: "42P01", message: 'relation "public.push_broadcasts" does not exist' };

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (table === "push_broadcasts") {
          return {
            order: () => ({
              limit: async () =>
                state.tableMissing
                  ? { data: null, error: MISSING }
                  : {
                      data: state.lastSentAt
                        ? [{ id: "b1", title: "Last", title_bn: "শেষ", body: "b", body_bn: "ব", href: "/offers", devices: 3, accepted: 2, sent_at: state.lastSentAt }]
                        : [],
                      error: null,
                    },
            }),
          };
        }
        // customer_push_subscriptions
        return {
          eq: (_c: string, _v: unknown) => {
            if (opts?.head) return Promise.resolve({ count: state.subs.length, error: null });
            return { limit: async () => ({ data: state.subs, error: null }) };
          },
        };
      },
      insert: async (row: Record<string, unknown>) => {
        if (table !== "push_broadcasts") return { error: { message: "no" } };
        state.inserted.push(row);
        return { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { GET, POST } from "../broadcast/route";

const post = (body: unknown) =>
  POST(
    new Request("http://x/api/admin/push/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const draft = { titleBn: "ঈদ ড্রপ", bodyBn: "আজ রাত ৯টা পর্যন্ত ফ্রি ডেলিভারি", href: "/campaign" };

beforeEach(() => {
  state.lastSentAt = null;
  state.tableMissing = false;
  state.subs = [];
  state.inserted.length = 0;
  state.sent.length = 0;
  process.env.PUSH_VAPID_PUBLIC_KEY = "BPub";
  process.env.PUSH_VAPID_PRIVATE_KEY = "Priv";
});

afterEach(() => {
  delete process.env.PUSH_VAPID_PUBLIC_KEY;
  delete process.env.PUSH_VAPID_PRIVATE_KEY;
});

describe("admin push broadcast", () => {
  it("GET reports the audience, the last send and when the next slot opens", async () => {
    state.subs = [{ endpoint: "https://p/1", p256dh: "k", auth: "a", phone: "01711111111", lang: "bn" }];
    state.lastSentAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const body = (await (await GET(new Request("http://x/api/admin/push/broadcast"))).json()) as {
      audience: number;
      last: { titleBn: string } | null;
      nextAllowedAt: number | null;
      ready: boolean;
    };
    expect(body.audience).toBe(1);
    expect(body.last?.titleBn).toBe("শেষ");
    expect(body.ready).toBe(true);
    expect(body.nextAllowedAt).toBeGreaterThan(Date.now());
  });

  it("sends one payload per device in its own language and records the row", async () => {
    state.subs = [
      { endpoint: "https://p/1", p256dh: "k", auth: "a", phone: "01711111111", lang: "bn" },
      { endpoint: "https://p/2", p256dh: "k", auth: "a", phone: "01722222222", lang: "en" },
    ];
    const res = await post(draft);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devices: number; accepted: number };
    expect(body).toMatchObject({ devices: 2, accepted: 2 });
    expect(state.sent).toHaveLength(2);
    expect(state.sent.map((p) => JSON.parse(p).title).sort()).toEqual(["ঈদ ড্রপ", "ঈদ ড্রপ"]);
    expect(state.inserted[0]).toMatchObject({ title_bn: "ঈদ ড্রপ", href: "/campaign", devices: 2, accepted: 2, sent_by: "owner@x.com" });
  });

  it("keeps to one broadcast per seven days (429 with Retry-After)", async () => {
    state.subs = [{ endpoint: "https://p/1", p256dh: "k", auth: "a", phone: "01711111111", lang: "bn" }];
    state.lastSentAt = new Date(Date.now() - 86_400_000).toISOString();
    const res = await post(draft);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(state.sent).toEqual([]);
  });

  it("does not spend the slot when nobody opted in, and rejects an empty draft", async () => {
    const empty = await post(draft);
    expect(empty.status).toBe(409);
    expect(state.inserted).toEqual([]);
    const bad = await post({ href: "/offers" });
    expect(bad.status).toBe(400);
  });

  it("names the migration when push_broadcasts is missing", async () => {
    state.tableMissing = true;
    state.subs = [{ endpoint: "https://p/1", p256dh: "k", auth: "a", phone: "01711111111", lang: "bn" }];
    const res = await post(draft);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("202609270001_push_broadcasts.sql");
  });
});
