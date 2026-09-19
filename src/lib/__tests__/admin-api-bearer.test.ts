import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-09-17 P2.2 / P2.6:
 * - `apiGet` attaches `Authorization: Bearer` like `apiSend`, so the server
 *   verifies the JWT from the header (no cookie → Auth round trip).
 * - The Supabase browser client is imported lazily and ONLY when the staff
 *   session flag is set — a plain visitor never downloads the auth bundle.
 */

const getSession = vi.fn(async () => ({
  data: { session: { access_token: "jwt-abc" } },
}));
// Counts client constructions (one per page lifetime when the flag is set).
const browserLoads = vi.fn(() => ({ auth: { getSession, signOut: vi.fn() } }));

vi.mock("../supabase-browser", () => ({
  getSupabaseBrowser: () => browserLoads(),
}));

const signOutAdmin = vi.fn();
vi.mock("../admin-auth", () => ({
  ADMIN_SESSION_KEY: "prosanti.admin.session.v1",
  signOutAdmin: () => signOutAdmin(),
}));

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

type FetchArgs = [input: string, init?: RequestInit];
const fetchMock = (impl: () => Promise<unknown>) =>
  vi.fn<(...args: FetchArgs) => Promise<unknown>>(impl);

beforeEach(() => {
  vi.resetModules();
  browserLoads.mockClear();
  getSession.mockClear();
  signOutAdmin.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin-api bearer + lazy client", () => {
  it("apiGet sends the staff JWT as a Bearer header when the staff flag is set", async () => {
    window.localStorage.setItem("prosanti.admin.session.v1", "1");
    const fetchSpy = fetchMock(async () => okResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const { apiGet } = await import("../admin-api");

    await expect(apiGet("/api/admin/orders")).resolves.toEqual({ ok: true });
    expect(browserLoads).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer jwt-abc");
    expect(init?.cache).toBe("no-store");
  });

  it("never loads the Supabase client (or sets a header) for a visitor without the staff flag", async () => {
    const fetchSpy = fetchMock(async () => okResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const { apiGet, apiSend } = await import("../admin-api");

    await apiGet("/api/referral");
    await apiSend("/api/whatever", "POST", { a: 1 });
    expect(browserLoads).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(new Headers(call[1]?.headers).get("authorization")).toBeNull();
    }
  });

  it("loads the client once and reuses it across calls", async () => {
    window.localStorage.setItem("prosanti.admin.session.v1", "1");
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({})));
    const { apiGet, apiSend } = await import("../admin-api");
    await apiGet("/api/admin/a");
    await apiGet("/api/admin/b");
    await apiSend("/api/admin/c", "PATCH", {});
    expect(browserLoads).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(3);
  });

  it("401 still signs the admin out and surfaces a session error", async () => {
    window.localStorage.setItem("prosanti.admin.session.v1", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );
    const { apiGet, AdminApiError } = await import("../admin-api");
    await expect(apiGet("/api/admin/orders")).rejects.toBeInstanceOf(AdminApiError);
    expect(signOutAdmin).toHaveBeenCalledTimes(1);
  });
});
