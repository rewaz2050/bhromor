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
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => data }) as Response;
const me = (id: string) =>
  response({ rider: { id, name: id }, email: `${id}@example.com` });
const payload = { fromHour: 8, toHour: 17, days: [1, 3, 5] };
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
  api.fetch.mockResolvedValueOnce(me("a"));
  const h = renderHook(() => useRiderSession());
  await act(async () => {});
  return h;
}
it("current save preserves PATCH payload and refreshes once", async () => {
  const { result } = await ready();
  api.fetch
    .mockResolvedValueOnce(response({ ok: true }))
    .mockResolvedValueOnce(me("a"));
  let message: string | null = "pending";
  await act(async () => {
    message = await result.current.setAvailability(payload);
  });
  expect(message).toBeNull();
  expect(api.fetch).toHaveBeenCalledTimes(3);
  expect(api.fetch.mock.calls[1]).toEqual([
    "/api/rider/availability",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify(payload) }),
  ]);
});
it("duplicate pending shift save dispatches only one PATCH", async () => {
  const { result } = await ready();
  const write = deferred<Response>();
  api.fetch.mockReturnValueOnce(write.promise);
  let first!: Promise<string | null>;
  act(() => {
    first = result.current.setAvailability(payload);
  });
  await act(async () => {
    expect(await result.current.setAvailability(payload)).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
  api.fetch.mockResolvedValueOnce(me("a"));
  await act(async () => {
    write.resolve(response({ ok: true }));
    await first;
  });
});
it("lock remains held through the follow-up read", async () => {
  const { result } = await ready();
  const read = deferred<Response>();
  api.fetch
    .mockResolvedValueOnce(response({ ok: true }))
    .mockReturnValueOnce(read.promise);
  let first!: Promise<string | null>;
  await act(async () => {
    first = result.current.setAvailability(payload);
  });
  await act(async () => {
    expect(await result.current.setAvailability(payload)).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(3);
  await act(async () => {
    read.resolve(me("a"));
    await first;
  });
});
it("captured callback cannot save after rider replacement", async () => {
  const { result } = await ready();
  const old = result.current.setAvailability;
  api.fetch.mockResolvedValueOnce(me("b"));
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    expect(await old(payload)).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
});
it("old success after replacement neither refreshes B nor reports current success", async () => {
  const { result } = await ready();
  const write = deferred<Response>();
  api.fetch.mockReturnValueOnce(write.promise);
  let pending!: Promise<string | null>;
  act(() => {
    pending = result.current.setAvailability(payload);
  });
  api.fetch.mockResolvedValueOnce(me("b"));
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    write.resolve(response({ ok: true }));
    expect(await pending).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(3);
  expect(result.current.rider?.id).toBe("b");
});
it("A → B → A does not revive an old shift completion", async () => {
  const { result } = await ready();
  const write = deferred<Response>();
  api.fetch.mockReturnValueOnce(write.promise);
  let pending!: Promise<string | null>;
  act(() => {
    pending = result.current.setAvailability(payload);
  });
  for (const id of ["b", "a"]) {
    api.fetch.mockResolvedValueOnce(me(id));
    await act(async () => {
      await result.current.refresh();
    });
  }
  await act(async () => {
    write.resolve(response({ ok: true }));
    expect(await pending).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(4);
});
it("sign-out invalidates pending save before remote sign-out settles", async () => {
  const { result } = await ready();
  const write = deferred<Response>(),
    out = deferred<{ error: null }>();
  api.fetch.mockReturnValueOnce(write.promise);
  api.signOut.mockReturnValueOnce(out.promise);
  let pending!: Promise<string | null>;
  act(() => {
    pending = result.current.setAvailability(payload);
    void result.current.signOut();
  });
  await act(async () => {
    write.resolve(response({ ok: true }));
    expect(await pending).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
  await act(async () => {
    out.resolve({ error: null });
  });
});
it("unmounted callback cannot dispatch and unmounted success cannot refresh", async () => {
  const { result, unmount } = await ready();
  const save = result.current.setAvailability,
    write = deferred<Response>();
  api.fetch.mockReturnValueOnce(write.promise);
  let pending!: Promise<string | null>;
  act(() => {
    pending = save(payload);
  });
  unmount();
  await act(async () => {
    expect(await save(payload)).not.toBeNull();
    write.resolve(response({ ok: true }));
    expect(await pending).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(2);
});
it("guest callback cannot save", async () => {
  api.fetch.mockResolvedValueOnce(response({}, 401));
  const { result } = renderHook(() => useRiderSession());
  await act(async () => {});
  await act(async () => {
    expect(await result.current.setAvailability(payload)).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it("current refusal preserves server error and unlocks retry", async () => {
  const { result } = await ready();
  api.fetch.mockResolvedValueOnce(response({ error: "Invalid hours" }, 400));
  await act(async () => {
    expect(await result.current.setAvailability(payload)).toBe("Invalid hours");
  });
  api.fetch
    .mockResolvedValueOnce(response({ ok: true }))
    .mockResolvedValueOnce(me("a"));
  await act(async () => {
    expect(await result.current.setAvailability(payload)).toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(4);
});
it("old refusal does not leak its server detail into a new rider", async () => {
  const { result } = await ready();
  const write = deferred<Response>();
  api.fetch.mockReturnValueOnce(write.promise);
  let pending!: Promise<string | null>;
  act(() => {
    pending = result.current.setAvailability(payload);
  });
  api.fetch.mockResolvedValueOnce(me("b"));
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    write.resolve(response({ error: "A private refusal" }, 400));
    expect(await pending).not.toBe("A private refusal");
  });
});
it("old completion cannot release B's pending lock", async () => {
  const { result } = await ready();
  const a = deferred<Response>(),
    b = deferred<Response>();
  api.fetch.mockReturnValueOnce(a.promise);
  let first!: Promise<string | null>, second!: Promise<string | null>;
  act(() => {
    first = result.current.setAvailability(payload);
  });
  api.fetch.mockResolvedValueOnce(me("b"));
  await act(async () => {
    await result.current.refresh();
  });
  api.fetch.mockReturnValueOnce(b.promise);
  act(() => {
    second = result.current.setAvailability(payload);
  });
  await act(async () => {
    a.resolve(response({ ok: true }));
    await first;
  });
  await act(async () => {
    expect(await result.current.setAvailability(payload)).not.toBeNull();
  });
  expect(api.fetch).toHaveBeenCalledTimes(4);
  api.fetch.mockResolvedValueOnce(me("b"));
  await act(async () => {
    b.resolve(response({ ok: true }));
    await second;
  });
});
it("denied follow-up read does not report a current successful save", async () => {
  const { result } = await ready();
  api.fetch
    .mockResolvedValueOnce(response({ ok: true }))
    .mockResolvedValueOnce(
      response({ error: "Suspended", reason: "suspended" }, 403),
    );
  await act(async () => {
    expect(await result.current.setAvailability(payload)).not.toBeNull();
  });
  expect(result.current.status).toBe("guest");
  expect(result.current.denyReason).toBe("suspended");
});
it("replacement discovered in the save's own refresh cannot receive old success", async () => {
  const { result } = await ready();
  api.fetch
    .mockResolvedValueOnce(response({ ok: true }))
    .mockResolvedValueOnce(me("b"));
  await act(async () => {
    expect(await result.current.setAvailability(payload)).not.toBeNull();
  });
  expect(result.current.rider?.id).toBe("b");
});
