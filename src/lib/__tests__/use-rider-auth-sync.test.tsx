import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  listeners: [] as Array<{
    cb: (event: string) => void;
    off: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@/lib/supabase-browser", () => {
  const client = {
    auth: {
      signInWithPassword: api.login,
      signOut: api.logout,
      onAuthStateChange: (cb: (e: string) => void) => {
        const entry = { cb, off: vi.fn() };
        api.listeners.push(entry);
        return { data: { subscription: { unsubscribe: entry.off } } };
      },
    },
  };
  return { getSupabaseBrowser: () => client };
});
vi.mock("@/lib/use-poll", () => ({ usePoll: vi.fn() }));
import { useRiderSession } from "../use-rider";
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => data }) as Response;
const me = (id = "a") =>
  response({ rider: { id }, email: `${id}@example.com` });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function emit(event: string) {
  for (const l of api.listeners) if (!l.off.mock.calls.length) l.cb(event);
}
beforeEach(() => {
  vi.useFakeTimers();
  api.listeners.length = 0;
  api.fetch.mockReset().mockResolvedValue(me());
  api.login.mockReset().mockResolvedValue({ error: null });
  api.logout.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", api.fetch);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function ready() {
  const h = renderHook(() => useRiderSession());
  await act(async () => {});
  return h;
}
it("SDK sign-out clears all mounted rider sessions", async () => {
  const a = await ready(),
    b = await ready();
  act(() => {
    emit("SIGNED_OUT");
  });
  expect(a.result.current.status).toBe("guest");
  expect(b.result.current.rider).toBeNull();
  expect(api.fetch).toHaveBeenCalledTimes(2);
});
it("SDK sign-in defers recheck outside callback then loads current identity", async () => {
  const h = await ready();
  api.fetch.mockResolvedValue(me("b"));
  act(() => {
    emit("SIGNED_IN");
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
  expect(h.result.current.rider).toBeNull();
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(h.result.current.rider?.id).toBe("b");
});
it("initial session event does not duplicate initial probe", async () => {
  await ready();
  act(() => {
    emit("INITIAL_SESSION");
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it("new sign-out discards an older scheduled sign-in recheck", async () => {
  const h = await ready();
  act(() => {
    emit("SIGNED_IN");
    emit("SIGNED_OUT");
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
  expect(h.result.current.status).toBe("guest");
});
it("sign-out invalidates an already-started session read", async () => {
  const h = await ready(),
    read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  act(() => {
    void h.result.current.refresh();
    emit("SIGNED_OUT");
  });
  await act(async () => {
    read.resolve(me("old"));
  });
  expect(h.result.current.rider).toBeNull();
});
it("unmount removes listener and suppresses saved callbacks and timers", async () => {
  const h = await ready();
  act(() => {
    emit("SIGNED_IN");
  });
  const old = api.listeners[0];
  h.unmount();
  old.cb("SIGNED_IN");
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(old.off).toHaveBeenCalledTimes(1);
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it("token refresh preserves last-known rider while rechecking", async () => {
  const h = await ready();
  act(() => {
    emit("TOKEN_REFRESHED");
  });
  expect(h.result.current.rider?.id).toBe("a");
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
});
it("SDK user update rechecks eligibility rather than granting access", async () => {
  const h = await ready();
  api.fetch.mockResolvedValueOnce(
    response({ error: "Suspended", reason: "suspended" }, 403),
  );
  act(() => {
    emit("USER_UPDATED");
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(h.result.current.denyReason).toBe("suspended");
  expect(h.result.current.status).toBe("guest");
});
it("own SDK login event does not invalidate its accepted helper result", async () => {
  const h = await ready();
  api.login.mockImplementationOnce(async () => {
    emit("SIGNED_IN");
    return { error: null };
  });
  await act(async () => {
    expect(
      await h.result.current.signIn("a@example.com", "secret12"),
    ).toBeNull();
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(h.result.current.status).toBe("authed");
});
it("two mounts share SDK ordering: logout cannot be overtaken by old login", async () => {
  const a = await ready(),
    b = await ready(),
    sdk = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(sdk.promise);
  let login!: Promise<string | null>, logout!: Promise<void>;
  await act(async () => {
    login = a.result.current.signIn("a@example.com", "secret12");
  });
  act(() => {
    logout = b.result.current.signOut();
  });
  await act(async () => {});
  expect(api.logout).not.toHaveBeenCalled();
  await act(async () => {
    sdk.resolve({ error: null });
    expect(await login).not.toBeNull();
    await logout;
  });
  expect(api.logout).toHaveBeenCalledTimes(1);
});
it("auth reset is not lost when a manual probe starts in the same batch", async () => {
  const h = await ready(),
    read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  act(() => {
    emit("SIGNED_OUT");
    void h.result.current.refresh();
  });
  expect(h.result.current.rider).toBeNull();
  expect(h.result.current.status).toBe("checking");
  await act(async () => {
    read.resolve(response({}, 401));
  });
  expect(h.result.current.status).toBe("guest");
});
it("logout still settles locally if an older login event arrives while queued", async () => {
  const h = await ready(),
    out = deferred<{ error: null }>();
  api.logout.mockReturnValueOnce(out.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.result.current.signOut();
  });
  act(() => {
    emit("SIGNED_IN");
  });
  await act(async () => {
    out.resolve({ error: null });
    await pending;
  });
  expect(h.result.current.status).toBe("guest");
});
