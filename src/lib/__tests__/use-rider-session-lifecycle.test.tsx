import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({ fetch: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => ({ auth: { signOut: api.signOut } }),
}));
vi.mock("@/lib/use-poll", () => ({ usePoll: vi.fn() }));
import { useRiderSession } from "../use-rider";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => data }) as Response;
const identity = (id: string) =>
  response({ rider: { id, name: id }, email: `${id}@example.com` });
beforeEach(() => {
  api.fetch.mockReset();
  api.signOut.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", api.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function ready() {
  api.fetch.mockResolvedValueOnce(identity("a"));
  const hook = renderHook(() => useRiderSession());
  await act(async () => {});
  return hook;
}
it("newest refresh success wins over late initial identity success", async () => {
  const old = deferred<Response>();
  api.fetch
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(identity("b"));
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    old.resolve(identity("a"));
  });
  expect(result.current.rider?.id).toBe("b");
  expect(result.current.email).toBe("b@example.com");
});
it("late old denial cannot erase newer authenticated identity", async () => {
  const old = deferred<Response>();
  api.fetch
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(identity("b"));
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    old.resolve(
      response({ error: "Old suspension", reason: "suspended" }, 403),
    );
  });
  expect(result.current.status).toBe("authed");
  expect(result.current.error).toBeNull();
  expect(result.current.denyReason).toBeNull();
});
it("newest denial wins over late old success", async () => {
  const old = deferred<Response>();
  api.fetch
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(
      response({ error: "Pending", reason: "pending" }, 403),
    );
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    old.resolve(identity("a"));
  });
  expect(result.current.status).toBe("guest");
  expect(result.current.rider).toBeNull();
  expect(result.current.email).toBe("");
  expect(result.current.error).toBe("Pending");
  expect(result.current.denyReason).toBe("pending");
});
it("current authed identity stays visible while refresh is pending", async () => {
  const { result } = await ready();
  const read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  act(() => {
    void result.current.refresh();
  });
  expect(result.current.status).toBe("authed");
  expect(result.current.rider?.id).toBe("a");
  await act(async () => {
    read.resolve(identity("b"));
  });
  expect(result.current.rider?.id).toBe("b");
});
it("old read cannot republish while sign-out is pending", async () => {
  const { result } = await ready();
  const read = deferred<Response>(),
    out = deferred<{ error: null }>();
  api.fetch.mockReturnValueOnce(read.promise);
  api.signOut.mockReturnValueOnce(out.promise);
  act(() => {
    void result.current.refresh();
    void result.current.signOut();
  });
  await act(async () => {
    read.resolve(identity("old"));
  });
  expect(result.current.rider?.id).not.toBe("old");
  await act(async () => {
    out.resolve({ error: null });
  });
  expect(result.current.status).toBe("guest");
});
it("late read after completed sign-out cannot restore an account", async () => {
  const { result } = await ready();
  const read = deferred<Response>();
  api.fetch.mockReturnValueOnce(read.promise);
  act(() => {
    void result.current.refresh();
  });
  await act(async () => {
    await result.current.signOut();
  });
  await act(async () => {
    read.resolve(identity("a"));
  });
  expect(result.current.status).toBe("guest");
  expect(result.current.rider).toBeNull();
  expect(result.current.email).toBe("");
});
it("refresh during pending sign-out does not read pre-sign-out credentials", async () => {
  const { result } = await ready();
  const out = deferred<{ error: null }>();
  api.signOut.mockReturnValueOnce(out.promise);
  act(() => {
    void result.current.signOut();
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
  await act(async () => {
    out.resolve({ error: null });
  });
});
it("duplicate pending sign-out calls dispatch once", async () => {
  const { result } = await ready();
  const out = deferred<{ error: null }>();
  api.signOut.mockReturnValueOnce(out.promise);
  await act(async () => {
    void result.current.signOut();
    void result.current.signOut();
  });
  expect(api.signOut).toHaveBeenCalledTimes(1);
  await act(async () => {
    out.resolve({ error: null });
  });
});
it("captured refresh after unmount performs no HTTP read", async () => {
  const { result, unmount } = await ready();
  const refresh = result.current.refresh;
  unmount();
  await act(async () => {
    await refresh();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it("unmounted sign-out callback does not dispatch an auth mutation", async () => {
  const { result, unmount } = await ready();
  const signOut = result.current.signOut;
  unmount();
  await act(async () => {
    await signOut();
  });
  expect(api.signOut).not.toHaveBeenCalled();
});
it("independent remount is not overwritten by the old mount read", async () => {
  const old = deferred<Response>();
  api.fetch.mockReturnValueOnce(old.promise);
  const a = renderHook(() => useRiderSession());
  a.unmount();
  api.fetch.mockResolvedValueOnce(identity("b"));
  const b = renderHook(() => useRiderSession());
  await act(async () => {});
  await act(async () => {
    old.resolve(identity("a"));
  });
  expect(b.result.current.rider?.id).toBe("b");
});
it.each(["pending", "suspended", "rejected", "none"])(
  "current 403 preserves %s denial",
  async (reason) => {
    api.fetch.mockResolvedValueOnce(response({ error: "Denied", reason }, 403));
    const { result } = renderHook(() => useRiderSession());
    await act(async () => {});
    expect(result.current.status).toBe("guest");
    expect(result.current.error).toBe("Denied");
    expect(result.current.denyReason).toBe(reason);
  },
);
it("current ordinary failure remains guest without a permission denial", async () => {
  api.fetch.mockRejectedValueOnce(new Error("Network"));
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {});
  expect(result.current.status).toBe("guest");
  expect(result.current.error).toBeNull();
  expect(result.current.denyReason).toBeNull();
});
it("sign-out rejection clears local identity and allows a later fresh probe", async () => {
  const { result } = await ready();
  api.signOut.mockRejectedValueOnce(new Error("Network"));
  await act(async () => {
    await result.current.signOut();
  });
  expect(result.current.status).toBe("guest");
  api.fetch.mockResolvedValueOnce(identity("b"));
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.rider?.id).toBe("b");
  expect(api.fetch.mock.calls.at(-1)).toEqual([
    "/api/rider/me",
    expect.objectContaining({ method: "GET", cache: "no-store" }),
  ]);
});
it("old JSON parsing completion cannot overwrite a newer probe", async () => {
  const parsed = deferred<{ rider: { id: string }; email: string }>();
  api.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => parsed.promise,
  });
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {});
  api.fetch.mockResolvedValueOnce(identity("b"));
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    parsed.resolve({ rider: { id: "a" }, email: "a@example.com" });
  });
  expect(result.current.rider?.id).toBe("b");
});
it("old refusal cannot settle a newer checking probe", async () => {
  const old = deferred<Response>(),
    fresh = deferred<Response>();
  api.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const { result } = renderHook(() => useRiderSession());
  act(() => {
    void result.current.refresh();
  });
  await act(async () => {
    old.resolve(response({ error: "Old denial", reason: "suspended" }, 403));
  });
  expect(result.current.status).toBe("checking");
  expect(result.current.error).toBeNull();
  await act(async () => {
    fresh.resolve(identity("b"));
  });
  expect(result.current.status).toBe("authed");
});
it("current unknown denial reason retains the none fallback", async () => {
  api.fetch.mockResolvedValueOnce(
    response({ error: "Denied", reason: "unexpected" }, 403),
  );
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {});
  expect(result.current.error).toBe("Denied");
  expect(result.current.denyReason).toBe("none");
});
it("a fresh retry clears the current denial and can authenticate", async () => {
  api.fetch.mockResolvedValueOnce(
    response({ error: "Wait", reason: "pending" }, 403),
  );
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {});
  const fresh = deferred<Response>();
  api.fetch.mockReturnValueOnce(fresh.promise);
  act(() => {
    void result.current.refresh();
  });
  expect(result.current.status).toBe("checking");
  expect(result.current.error).toBeNull();
  expect(result.current.denyReason).toBeNull();
  await act(async () => {
    fresh.resolve(identity("b"));
  });
  expect(result.current.email).toBe("b@example.com");
});
it("late permission refusal cannot reintroduce an error after sign-out", async () => {
  const { result } = await ready();
  const old = deferred<Response>();
  api.fetch.mockReturnValueOnce(old.promise);
  act(() => {
    void result.current.refresh();
  });
  await act(async () => {
    await result.current.signOut();
  });
  await act(async () => {
    old.resolve(response({ error: "Old refusal", reason: "suspended" }, 403));
  });
  expect(result.current.status).toBe("guest");
  expect(result.current.error).toBeNull();
  expect(result.current.denyReason).toBeNull();
});

it("Strict Mode effect replay cannot revive the abandoned initial probe", async () => {
  const old = deferred<Response>();
  api.fetch
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(identity("b"));
  const { result } = renderHook(() => useRiderSession(), {
    reactStrictMode: true,
  });
  await act(async () => {});
  expect(api.fetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    old.resolve(identity("a"));
  });
  expect(result.current.rider?.id).toBe("b");
});
