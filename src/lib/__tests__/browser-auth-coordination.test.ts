import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
const api = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/supabase-browser", () => {
  const client = {
    auth: {
      signInWithPassword: api.login,
      signOut: api.logout,
      getSession: api.session,
    },
  };
  return { getSupabaseBrowser: () => client };
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const response = (staff: boolean, status = 200) =>
  ({ ok: status === 200, status, json: async () => ({ staff }) }) as Response;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  api.login
    .mockReset()
    .mockResolvedValue({
      error: null,
      data: { session: { access_token: "staff-token" } },
    });
  api.logout.mockReset().mockResolvedValue({ error: null });
  api.session
    .mockReset()
    .mockResolvedValue({ data: { session: { access_token: "staff-token" } } });
  api.fetch.mockReset().mockResolvedValue(response(true));
  vi.stubGlobal("fetch", api.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("staff success still requires role probe with the SDK token", async () => {
  const auth = await import("../admin-auth");
  expect(await auth.signInStaff(" staff@example.com ", "secret")).toEqual({
    ok: true,
  });
  expect(api.login).toHaveBeenCalledWith({
    email: "staff@example.com",
    password: "secret",
  });
  expect(api.fetch).toHaveBeenCalledWith(
    "/api/admin/me",
    expect.objectContaining({
      headers: { Authorization: "Bearer staff-token" },
    }),
  );
  expect(auth.getAdminAuthed()).toBe(true);
});
it("current role refusal signs out and never publishes staff access", async () => {
  const auth = await import("../admin-auth");
  api.fetch.mockResolvedValueOnce(response(false, 403));
  expect((await auth.signInStaff("a@example.com", "secret")).ok).toBe(false);
  expect(api.logout).toHaveBeenCalledTimes(1);
  expect(auth.getAdminAuthed()).toBe(false);
});
it("superseded role refusal must not compensate by signing out a newer login", async () => {
  const auth = await import("../admin-auth"),
    lane = await import("../rider-auth-lane"),
    browser = await import("../supabase-browser");
  const read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  const first = auth.signInStaff("a@example.com", "secret");
  await vi.waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(1));
  const other = vi.fn(async () => "vendor");
  const newer = lane.runBrowserAuthMutation(
    browser.getSupabaseBrowser()!,
    () => true,
    other,
  );
  read.resolve(response(false, 403));
  expect((await first).ok).toBe(false);
  await newer;
  expect(api.logout).not.toHaveBeenCalled();
  expect(other).toHaveBeenCalledTimes(1);
  expect(auth.getAdminAuthed()).toBe(false);
});
it("sign-out during pending staff login prevents late staff publication", async () => {
  const auth = await import("../admin-auth"),
    sdk = deferred<unknown>();
  api.login.mockReturnValueOnce(sdk.promise);
  const first = auth.signInStaff("a@example.com", "secret");
  await vi.waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
  auth.signOutAdmin();
  sdk.resolve({ error: null, data: { session: { access_token: "a" } } });
  expect((await first).ok).toBe(false);
  await vi.waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
  expect(api.fetch).not.toHaveBeenCalled();
  expect(auth.getAdminAuthed()).toBe(false);
});
it("old staff refresh cannot restore flag after sign-out", async () => {
  const auth = await import("../admin-auth");
  await auth.signInStaff("a@example.com", "secret");
  const read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  const old = auth.refreshStaffSession();
  await vi.waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(2));
  auth.signOutAdmin();
  read.resolve(response(true));
  expect(await old).toBe(false);
  expect(auth.getAdminAuthed()).toBe(false);
});
it("unexpected staff SDK rejection returns safe failure and permits retry", async () => {
  const auth = await import("../admin-auth");
  api.login.mockRejectedValueOnce(new Error("private"));
  expect(await auth.signInStaff("a@example.com", "secret")).toEqual({
    ok: false,
    error: "Staff sign-in could not be verified — please try again.",
  });
  expect(await auth.signInStaff("a@example.com", "secret")).toEqual({
    ok: true,
  });
});
it("Web Locks serialize participating SDK calls across distinct clients", async () => {
  const lane = await import("../rider-auth-lane");
  let tail = Promise.resolve();
  const names: string[] = [];
  const request = vi.fn(
    (name: string, _options: unknown, cb: () => Promise<unknown>) => {
      names.push(name);
      const p = tail.then(cb);
      tail = p.then(
        () => undefined,
        () => undefined,
      );
      return p;
    },
  );
  vi.stubGlobal("navigator", { locks: { request } });
  const pending = deferred<void>(),
    events: string[] = [];
  const a = lane.runBrowserAuthMutation(
    {},
    () => true,
    async () => {
      events.push("a");
      await pending.promise;
    },
  );
  await vi.waitFor(() => expect(events).toEqual(["a"]));
  const b = lane.runBrowserAuthMutation(
    {},
    () => true,
    async () => {
      events.push("b");
    },
  );
  await Promise.resolve();
  expect(events).toEqual(["a"]);
  pending.resolve();
  await a;
  await b;
  expect(events).toEqual(["a", "b"]);
  expect(names).toEqual(["bhromor:browser-auth", "bhromor:browser-auth"]);
});
it("failed Web Lock acquisition does not silently dispatch without a lock", async () => {
  const lane = await import("../rider-auth-lane"),
    sdk = vi.fn(async () => {});
  vi.stubGlobal("navigator", {
    locks: { request: vi.fn().mockRejectedValue(new Error("Lock denied")) },
  });
  await expect(
    lane.runBrowserAuthMutation({}, () => true, sdk),
  ).rejects.toThrow("Lock denied");
  expect(sdk).not.toHaveBeenCalled();
});

it("vendor SDK sign-in joins the same client queue", async () => {
  const vendor = await import("../use-vendor"),
    lane = await import("../rider-auth-lane"),
    browser = await import("../supabase-browser");
  const h = renderHook(() => vendor.useVendorSession());
  await act(async () => {});
  const pending = deferred<void>();
  const first = lane.runBrowserAuthMutation(
    browser.getSupabaseBrowser()!,
    () => true,
    () => pending.promise,
  );
  await Promise.resolve();
  let login!: Promise<string | null>;
  await act(async () => {
    login = h.result.current.signIn(" vendor@example.com ", "secret");
  });
  expect(api.login).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve();
    await first;
    expect(await login).toBeNull();
  });
  expect(api.login).toHaveBeenCalledWith({
    email: "vendor@example.com",
    password: "secret",
  });
});
it("vendor logout waits for a running participating SDK operation", async () => {
  const vendor = await import("../use-vendor"),
    lane = await import("../rider-auth-lane"),
    browser = await import("../supabase-browser");
  const h = renderHook(() => vendor.useVendorSession());
  await act(async () => {});
  const pending = deferred<void>();
  const first = lane.runBrowserAuthMutation(
    browser.getSupabaseBrowser()!,
    () => true,
    () => pending.promise,
  );
  await Promise.resolve();
  let logout!: Promise<void>;
  await act(async () => {
    logout = h.result.current.signOut();
  });
  expect(api.logout).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve();
    await first;
    await logout;
  });
  expect(api.logout).toHaveBeenCalledTimes(1);
  expect(h.result.current.status).toBe("guest");
});
