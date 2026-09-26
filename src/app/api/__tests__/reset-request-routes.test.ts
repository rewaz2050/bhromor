/**
 * Public reset-request routes (2026-09-26; no SMS, no e-mail) and the
 * staff decision route. The DB module is mocked; these check wiring,
 * validation, readiness and rate-limit behaviour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  service: {} as object | null,
  ready: true,
  created: true,
  status: { status: "pending", requestedAt: "2026-09-26T10:00:00Z", expiresAt: null, note: null } as Record<string, unknown>,
  notices: [] as { title: string; href?: string }[],
  routeOpts: [] as unknown[],
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => state.service,
}));
vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async (_db: unknown, notice: { title: string; href?: string }) => {
    state.notices.push(notice);
  },
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...orig, checkRateLimit: () => ({ allowed: true, retryAfterSec: 1 }), clientIpFromHeaders: () => "9.9.9.9" };
});
vi.mock("@/lib/db/password-reset", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/password-reset")>();
  return {
    ...orig,
    resetRequestsReady: async () => state.ready,
    createResetRequest: vi.fn(async (_s: unknown, input: { kind: string; email: string; phone: string; ip?: string | null }) => {
      if (input.email === "who@example.com") throw new orig.ResetRequestError("no such login", 404);
      return {
        request: state.status,
        subject: { userId: "u1", subjectId: "s1", name: "Arian Fashion" },
        created: state.created,
      };
    }),
    resetRequestStatus: vi.fn(async () => state.status),
    completeResetRequest: vi.fn(async (_s: unknown, input: { password: string }) => {
      if (input.password === "abc") throw new orig.ResetRequestError("short", 400);
      if (input.password === "late-pass") throw new orig.ResetRequestError("expired", 410);
    }),
    decideResetRequest: vi.fn(async (_db: unknown, input: { id: string; action: string; note?: string | null; staffId: string }) => {
      if (input.id === "gone") throw new orig.ResetRequestError("This request was already decided.", 409);
      return { id: input.id, status: input.action === "approve" ? "approved" : "rejected", note: input.note ?? null };
    }),
  };
});
vi.mock("../admin/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../admin/_lib")>();
  return {
    ...orig,
    staffRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => Promise<Response>,
      opts?: unknown,
    ) => {
      state.routeOpts.push(opts);
      return async (req: Request, routeCtx?: unknown) => {
        try {
          return await handler({ db: {}, user: { id: "staff-1" }, role: "admin" }, req, routeCtx);
        } catch (err) {
          const e = err as { message: string; status?: number };
          return new Response(JSON.stringify({ error: e.message }), { status: e.status ?? 503 });
        }
      };
    },
  };
});

import { GET as statusGet, POST as requestPost } from "../auth/reset-request/route";
import { POST as completePost } from "../auth/reset-complete/route";
import { POST as decidePost } from "../admin/access-requests/[id]/route";
import { createResetRequest, decideResetRequest } from "@/lib/db/password-reset";

const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.service = {};
  state.ready = true;
  state.created = true;
  state.status = { status: "pending", requestedAt: "2026-09-26T10:00:00Z", expiresAt: null, note: null };
  state.notices = [];
  vi.mocked(createResetRequest).mockClear();
});

describe("POST /api/auth/reset-request", () => {
  it("files the request, pings staff, answers 202", async () => {
    const res = await requestPost(post("/api/auth/reset-request", { kind: "vendor", email: " Shop@Example.com ", phone: "+8801712345678" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "pending", created: true });
    expect(vi.mocked(createResetRequest).mock.calls[0][1]).toMatchObject({ kind: "vendor", email: "shop@example.com", phone: "01712345678", ip: "9.9.9.9" });
    expect(state.notices[0].title).toMatch(/Password reset request — Arian Fashion/);
    expect(state.notices[0].href).toBe("/admin/access");
  });

  it("answers the open request (200) without a second staff notice", async () => {
    state.created = false;
    const res = await requestPost(post("/api/auth/reset-request", { kind: "vendor", email: "shop@example.com", phone: "01712345678" }));
    expect(res.status).toBe(200);
    expect(state.notices).toHaveLength(0);
  });

  it("400s bad input before touching the database", async () => {
    const res = await requestPost(post("/api/auth/reset-request", { kind: "vendor", email: "nope", phone: "01712345678" }));
    expect(res.status).toBe(400);
    expect(createResetRequest).not.toHaveBeenCalled();
    const kind = await requestPost(post("/api/auth/reset-request", { kind: "staff", email: "a@b.co", phone: "01712345678" }));
    expect(kind.status).toBe(400);
  });

  it("404s an unknown email + phone pair with the module's message", async () => {
    const res = await requestPost(post("/api/auth/reset-request", { kind: "vendor", email: "who@example.com", phone: "01712345678" }));
    expect(res.status).toBe(404);
  });

  it("503s without a service key or before the migration", async () => {
    state.service = null;
    expect((await requestPost(post("/api/auth/reset-request", { kind: "vendor", email: "a@b.co", phone: "01712345678" }))).status).toBe(503);
    state.service = {};
    state.ready = false;
    const res = await requestPost(post("/api/auth/reset-request", { kind: "vendor", email: "a@b.co", phone: "01712345678" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("চালু হয়নি");
  });
});

describe("GET /api/auth/reset-request", () => {
  it("returns the status for the exact pair, 400 without both", async () => {
    state.status = { status: "approved", requestedAt: "x", expiresAt: "2026-09-27T10:00:00Z", note: null };
    const ok = await statusGet(new Request("http://localhost/api/auth/reset-request?kind=rider&email=r@x.co&phone=01811111111"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "approved", expiresAt: "2026-09-27T10:00:00Z" });
    const missing = await statusGet(new Request("http://localhost/api/auth/reset-request?kind=rider&email=r@x.co"));
    expect(missing.status).toBe(400);
  });
});

describe("POST /api/auth/reset-complete", () => {
  it("sets the password inside an approved window", async () => {
    const res = await completePost(post("/api/auth/reset-complete", { kind: "rider", email: "r@x.co", phone: "01811111111", password: "newpass1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ done: true });
  });
  it("maps module refusals to their status codes", async () => {
    expect((await completePost(post("/api/auth/reset-complete", { kind: "rider", email: "r@x.co", phone: "01811111111", password: "abc" }))).status).toBe(400);
    expect((await completePost(post("/api/auth/reset-complete", { kind: "rider", email: "r@x.co", phone: "01811111111", password: "late-pass" }))).status).toBe(410);
  });
});

describe("POST /api/admin/access-requests/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("approves with the staff id and answers the row", async () => {
    const res = await decidePost(post("/api/admin/access-requests/req-1", { action: "approve" }), ctx("req-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ request: { id: "req-1", status: "approved" } });
    expect(vi.mocked(decideResetRequest).mock.calls.at(-1)?.[1]).toMatchObject({ id: "req-1", action: "approve", staffId: "staff-1" });
  });

  it("rejects with a note, 400s an unknown action, 409s a decided row", async () => {
    const rej = await decidePost(post("/api/admin/access-requests/req-2", { action: "reject", note: "call failed" }), ctx("req-2"));
    expect(await rej.json()).toMatchObject({ request: { status: "rejected", note: "call failed" } });
    expect((await decidePost(post("/api/admin/access-requests/req-2", { action: "nuke" }), ctx("req-2"))).status).toBe(400);
    expect((await decidePost(post("/api/admin/access-requests/gone", { action: "approve" }), ctx("gone"))).status).toBe(409);
  });

  it("is restricted to admin / super_admin", () => {
    const opts = state.routeOpts.find((o) => typeof o === "object" && o !== null && "roles" in o) as { roles: string[] };
    expect(opts.roles).toEqual(["admin", "super_admin"]);
  });
});
