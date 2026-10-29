import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  configured: true,
}));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () =>
    api.configured
      ? { auth: { signInWithPassword: api.login, signOut: api.logout } }
      : null,
}));
vi.mock("@/lib/use-poll", () => ({ usePoll: vi.fn() }));
import { useRiderSession } from "../use-rider";
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => data }) as Response;
const me = () => response({ rider: { id: "a" }, email: "a@example.com" });
beforeEach(() => {
  api.configured = true;
  api.fetch.mockReset().mockResolvedValue(response({}, 401));
  api.login.mockReset().mockResolvedValue({ error: null });
  api.logout.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", api.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function ready() {
  const h = renderHook(() => useRiderSession());
  await act(async () => {});
  return h;
}
it("current login keeps trimmed email, password and one follow-up probe", async () => {
  const { result } = await ready();
  api.fetch.mockResolvedValueOnce(me());
  await act(async () => {
    expect(
      await result.current.signIn(" a@example.com ", "secret12"),
    ).toBeNull();
  });
  expect(api.login).toHaveBeenCalledExactlyOnceWith({
    email: "a@example.com",
    password: "secret12",
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe("authed");
});
it("pending duplicate login cannot dispatch another SDK mutation", async () => {
  const { result } = await ready();
  const pending = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(pending.promise);
  let first!: Promise<string | null>;
  act(() => {
    first = result.current.signIn("a@example.com", "secret12");
  });
  await act(async () => {
    expect(
      await result.current.signIn("b@example.com", "secret34"),
    ).not.toBeNull();
  });
  expect(api.login).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve({ error: null });
    await first;
  });
});
it("login lock remains held through the session probe", async () => {
  const { result } = await ready();
  const read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  let first!: Promise<string | null>;
  await act(async () => {
    first = result.current.signIn("a@example.com", "secret12");
  });
  await act(async () => {
    expect(
      await result.current.signIn("b@example.com", "secret34"),
    ).not.toBeNull();
  });
  expect(api.login).toHaveBeenCalledTimes(1);
  await act(async () => {
    read.resolve(me());
    await first;
  });
});
it("unmounted captured login callback cannot call the SDK", async () => {
  const { result, unmount } = await ready();
  const login = result.current.signIn;
  unmount();
  await act(async () => {
    expect(await login("a@example.com", "secret12")).not.toBeNull();
  });
  expect(api.login).not.toHaveBeenCalled();
});
it("unmounted SDK success cannot probe or return accepted current success", async () => {
  const { result, unmount } = await ready();
  const pending = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(pending.promise);
  let first!: Promise<string | null>;
  act(() => {
    first = result.current.signIn("a@example.com", "secret12");
  });
  unmount();
  await act(async () => {
    pending.resolve({ error: null });
    expect(await first).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it("sign-out invalidates a pending login even when logout finishes first", async () => {
  const { result } = await ready();
  const pending = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(pending.promise);
  let first!: Promise<string | null>;
  act(() => {
    first = result.current.signIn("a@example.com", "secret12");
  });
  await act(async () => {
    await result.current.signOut();
  });
  await act(async () => {
    pending.resolve({ error: null });
    expect(await first).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("guest");
});
it("login while logout is pending cannot enter the SDK", async () => {
  const { result } = await ready();
  const pending = deferred<{ error: null }>();
  api.logout.mockReturnValueOnce(pending.promise);
  act(() => {
    void result.current.signOut();
  });
  await act(async () => {
    expect(
      await result.current.signIn("a@example.com", "secret12"),
    ).not.toBeNull();
  });
  expect(api.login).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve({ error: null });
  });
});
it("unexpected SDK rejection returns safe copy and unlocks retry", async () => {
  const { result } = await ready();
  api.login.mockRejectedValueOnce(new Error("Private transport detail"));
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "secret12")).toBe(
      "Sign-in could not be verified — please try again.",
    );
  });
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "secret12")).toBeNull();
  });
  expect(api.login).toHaveBeenCalledTimes(2);
});
it("current expected credential refusal preserves existing copy without a probe", async () => {
  const { result } = await ready();
  api.login.mockResolvedValueOnce({
    error: { message: "Invalid login credentials" },
  });
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "wrong")).toBe(
      "Email or password did not match.",
    );
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it("SDK unavailable keeps its existing configuration guidance", async () => {
  const { result } = await ready();
  api.configured = false;
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "secret12")).toBe(
      "Rider sign-in needs Supabase to be configured.",
    );
  });
  expect(api.login).not.toHaveBeenCalled();
});
it("current SDK acceptance still lets the API decide rider eligibility", async () => {
  const { result } = await ready();
  api.fetch.mockResolvedValueOnce(
    response({ error: "Pending", reason: "pending" }, 403),
  );
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "secret12")).toBeNull();
  });
  expect(result.current.status).toBe("guest");
  expect(result.current.denyReason).toBe("pending");
});
it("sign-out during the login probe prevents a late accepted login result", async () => {
  const { result } = await ready();
  const read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  let first!: Promise<string | null>;
  await act(async () => {
    first = result.current.signIn("a@example.com", "secret12");
  });
  await act(async () => {
    await result.current.signOut();
  });
  await act(async () => {
    read.resolve(me());
    expect(await first).not.toBeNull();
  });
  expect(result.current.status).toBe("guest");
});
it("new shift write cannot start while a login is changing identity", async () => {
  api.fetch.mockResolvedValueOnce(me());
  const { result } = await ready();
  const pending = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(pending.promise);
  let login!: Promise<string | null>;
  act(() => {
    login = result.current.signIn("b@example.com", "secret12");
  });
  await act(async () => {
    expect(
      await result.current.setAvailability({
        fromHour: 8,
        toHour: 17,
        days: [],
      }),
    ).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve({ error: null });
    await login;
  });
});
it("login intent invalidates an already-started shift completion", async () => {
  api.fetch.mockResolvedValueOnce(me());
  const { result } = await ready();
  const write = deferred<Response>(),
    sdk = deferred<{ error: null }>();
  api.fetch.mockReturnValueOnce(write.promise);
  api.login.mockReturnValueOnce(sdk.promise);
  let shift!: Promise<string | null>, login!: Promise<string | null>;
  act(() => {
    shift = result.current.setAvailability({
      fromHour: 8,
      toHour: 17,
      days: [],
    });
    login = result.current.signIn("b@example.com", "secret12");
  });
  await act(async () => {
    write.resolve(response({ ok: true }));
    expect(await shift).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    sdk.resolve({ error: null });
    await login;
  });
});
it("old mount completion cannot probe or release the new mount login lock", async () => {
  const a = await ready(),
    first = deferred<{ error: null }>(),
    second = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(first.promise);
  let old!: Promise<string | null>;
  await act(async () => {
    old = a.result.current.signIn("a@example.com", "secret12");
  });
  a.unmount();
  const b = await ready();
  api.login.mockReturnValueOnce(second.promise);
  let fresh!: Promise<string | null>;
  act(() => {
    fresh = b.result.current.signIn("b@example.com", "secret12");
  });
  await act(async () => {
    first.resolve({ error: null });
    expect(await old).not.toBeNull();
  });
  await act(async () => {
    expect(
      await b.result.current.signIn("c@example.com", "secret12"),
    ).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
  expect(api.login).toHaveBeenCalledTimes(2);
  await act(async () => {
    second.resolve({ error: null });
    await fresh;
  });
});
it("ordinary SDK refusal releases the same-owner lock for retry", async () => {
  const { result } = await ready();
  api.login.mockResolvedValueOnce({ error: { message: "Wrong password" } });
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "wrong")).toBe(
      "Email or password did not match.",
    );
  });
  await act(async () => {
    expect(await result.current.signIn("a@example.com", "secret12")).toBeNull();
  });
  expect(api.login).toHaveBeenCalledTimes(2);
});
