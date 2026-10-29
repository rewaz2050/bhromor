import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  label: "a",
  channels: [] as { change: () => void; status: (s: string) => void }[],
}));
vi.mock("@/lib/use-poll", () => ({ usePoll: vi.fn() }));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    channel: () => {
      const entry = {
        change: () => {},
        status: (status: string) => {
          void status;
        },
      };
      api.channels.push(entry);
      const channel = {
        on: (_e: string, _c: unknown, cb: () => void) => {
          entry.change = cb;
          return channel;
        },
        subscribe: (cb: (s: string) => void) => {
          entry.status = cb;
          return channel;
        },
      };
      return channel;
    },
    removeChannel: vi.fn(),
  }),
}));
import { useRiderJobs } from "../use-rider";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const response = (data: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => data }) as Response;
const read = (url: string) =>
  response(
    url === "/api/rider/jobs"
      ? { jobs: [{ id: api.label }] }
      : {
          settlements: [{ id: api.label }],
          pendingClaim: { id: api.label },
          recentClaims: [{ id: api.label }],
          claimsReady: true,
        },
  );
const reads = () =>
  api.fetch.mock.calls.filter(([url]) => url === "/api/rider/jobs").length;
const actions = [
  {
    name: "accept",
    invoke: (h: ReturnType<typeof useRiderJobs>) => h.accept("a/b"),
    path: "/api/rider/assignments/a%2Fb/accept",
    method: "POST",
    refresh: true,
    body: undefined,
  },
  {
    name: "pickup",
    invoke: (h: ReturnType<typeof useRiderJobs>) => h.pickup("a/b"),
    path: "/api/rider/assignments/a%2Fb/pickup",
    method: "POST",
    refresh: true,
    body: undefined,
  },
  {
    name: "reject",
    invoke: (h: ReturnType<typeof useRiderJobs>) => h.reject("a/b"),
    path: "/api/rider/assignments/a%2Fb/reject",
    method: "POST",
    refresh: true,
    body: undefined,
  },
  {
    name: "deliver",
    invoke: (h: ReturnType<typeof useRiderJobs>) =>
      h.deliver("a/b", "1234", null, "camera unavailable"),
    path: "/api/rider/assignments/a%2Fb/deliver",
    method: "POST",
    refresh: true,
    body: { code: "1234", proofUrl: null, noPhotoReason: "camera unavailable" },
  },
  {
    name: "setOnline",
    invoke: (h: ReturnType<typeof useRiderJobs>) => h.setOnline(true),
    path: "/api/rider/online",
    method: "PATCH",
    refresh: false,
    body: { isOnline: true },
  },
  {
    name: "updateLocation",
    invoke: (h: ReturnType<typeof useRiderJobs>) =>
      h.updateLocation(23.7, 90.4),
    path: "/api/rider/location",
    method: "PATCH",
    refresh: false,
    body: { lat: 23.7, lng: 90.4 },
  },
  {
    name: "settle",
    invoke: (h: ReturnType<typeof useRiderJobs>) => h.settle("bank", "REF123"),
    path: "/api/rider/settle",
    method: "POST",
    refresh: true,
    body: { method: "bank", reference: "REF123" },
  },
];
beforeEach(() => {
  api.label = "a";
  api.channels = [];
  api.fetch.mockReset().mockImplementation(async (url: string) => read(url));
  vi.stubGlobal("fetch", api.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount() {
  const hook = renderHook(({ id, enabled }) => useRiderJobs(enabled, id), {
    initialProps: { id: "a", enabled: true },
  });
  await waitFor(() => expect(hook.result.current.jobs[0]?.id).toBe("a"));
  return hook;
}
it.each(actions)(
  "$name stale success cannot clear current error, start refresh or return current success",
  async (entry) => {
    const { result, rerender } = await mount();
    const pending = deferred<Response>();
    api.fetch.mockImplementation((url: string, options: RequestInit) =>
      options.method === "GET" ? Promise.resolve(read(url)) : pending.promise,
    );
    let flight!: Promise<boolean>;
    act(() => {
      flight = entry.invoke(result.current);
    });
    api.label = "b";
    rerender({ id: "b", enabled: true });
    await act(async () => {
      await result.current.refresh();
    });
    api.fetch.mockImplementation(async (url: string) =>
      url === "/api/rider/jobs"
        ? response({ error: "Current B read failure" }, 503)
        : read(url),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("Current B read failure");
    const before = reads();
    await act(async () => {
      pending.resolve(response({}));
      expect(await flight).toBe(false);
    });
    expect(reads()).toBe(before);
    expect(result.current.error).toBe("Current B read failure");
  },
);
it.each(actions.filter((entry) => entry.name !== "updateLocation"))(
  "$name stale refusal cannot publish into new rider state",
  async (entry) => {
    const { result, rerender } = await mount();
    const pending = deferred<Response>();
    api.fetch.mockImplementation((url: string, options: RequestInit) =>
      options.method === "GET" ? Promise.resolve(read(url)) : pending.promise,
    );
    let flight!: Promise<boolean>;
    act(() => {
      flight = entry.invoke(result.current);
    });
    api.label = "b";
    rerender({ id: "b", enabled: true });
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      pending.resolve(response({ error: "Old mutation failure" }, 500));
      expect(await flight).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.jobs[0]?.id).toBe("b");
  },
);
it.each(actions)(
  "$name current success keeps its method/payload and refresh behavior",
  async (entry) => {
    const { result } = await mount();
    const before = reads();
    api.fetch.mockImplementation(async (url: string, options: RequestInit) =>
      options.method === "GET" ? read(url) : response({}),
    );
    await act(async () => {
      expect(await entry.invoke(result.current)).toBe(true);
    });
    const call = api.fetch.mock.calls.find(([url]) => url === entry.path)!;
    expect(call[1].method).toBe(entry.method);
    expect(call[1].body).toBe(
      entry.body === undefined ? undefined : JSON.stringify(entry.body),
    );
    expect(reads() - before).toBe(entry.refresh ? 1 : 0);
  },
);
it("new rider refresh starts independently while old reads are unresolved", async () => {
  const old = deferred<Response>();
  api.fetch.mockImplementation((url: string) =>
    api.label === "a" ? old.promise : Promise.resolve(read(url)),
  );
  const { result, rerender } = renderHook(({ id }) => useRiderJobs(true, id), {
    initialProps: { id: "a" },
  });
  api.label = "b";
  rerender({ id: "b" });
  await waitFor(() => expect(result.current.jobs[0]?.id).toBe("b"));
  await act(async () => {
    old.resolve(
      response({
        jobs: [{ id: "old" }],
        settlements: [{ id: "old" }],
        pendingClaim: { id: "old" },
        recentClaims: [],
      }),
    );
  });
  expect(result.current.jobs[0]?.id).toBe("b");
  expect(result.current.pendingClaim?.id).toBe("b");
  expect(result.current.loading).toBe(false);
});
it("old read completion cannot unlock a newer pending refresh", async () => {
  const a = deferred<Response>(),
    b = deferred<Response>();
  api.fetch.mockImplementation(() =>
    api.label === "a" ? a.promise : b.promise,
  );
  const { result, rerender } = renderHook(({ id }) => useRiderJobs(true, id), {
    initialProps: { id: "a" },
  });
  api.label = "b";
  rerender({ id: "b" });
  await act(async () => {
    a.resolve(response({ jobs: [], settlements: [] }));
  });
  const before = reads();
  let refresh!: Promise<boolean>;
  act(() => {
    refresh = result.current.refresh();
  });
  expect(reads()).toBe(before);
  expect(result.current.loading).toBe(true);
  await act(async () => {
    b.resolve(response({ jobs: [{ id: "b" }], settlements: [] }));
    await refresh;
  });
  expect(result.current.jobs[0]?.id).toBe("b");
});
it("disabled state is empty and old completion does not repopulate it", async () => {
  const { result, rerender } = await mount();
  const old = deferred<Response>();
  api.fetch.mockImplementation(() => old.promise);
  let flight!: Promise<boolean>;
  act(() => {
    flight = result.current.refresh();
  });
  rerender({ id: "a", enabled: false });
  expect(result.current.jobs).toEqual([]);
  expect(result.current.pendingClaim).toBeNull();
  expect(result.current.live).toBe(false);
  await act(async () => {
    old.resolve(response({ jobs: [{ id: "old" }], settlements: [] }));
    expect(await flight).toBe(false);
  });
  expect(result.current.jobs).toEqual([]);
});
it("old realtime callbacks cannot mark new channel live or start a read", async () => {
  const { result, rerender } = await mount();
  const old = api.channels[0];
  api.label = "b";
  rerender({ id: "b", enabled: true });
  await act(async () => {
    await result.current.refresh();
  });
  const before = reads();
  await act(async () => {
    old.status("SUBSCRIBED");
    old.change();
  });
  expect(result.current.live).toBe(false);
  expect(reads()).toBe(before);
  act(() => {
    api.channels[1].status("SUBSCRIBED");
  });
  expect(result.current.live).toBe(true);
});
it("captured old methods after unmount or identity replacement cannot dispatch", async () => {
  const { result, rerender, unmount } = await mount();
  const old = result.current;
  api.label = "b";
  rerender({ id: "b", enabled: true });
  await act(async () => {
    await result.current.refresh();
  });
  let before = api.fetch.mock.calls.length;
  await act(async () => {
    for (const entry of actions) expect(await entry.invoke(old)).toBe(false);
  });
  expect(api.fetch.mock.calls.length).toBe(before);
  const current = result.current;
  unmount();
  before = api.fetch.mock.calls.length;
  for (const entry of actions) expect(await entry.invoke(current)).toBe(false);
  expect(api.fetch.mock.calls.length).toBe(before);
});
it("current 409 refreshes once then preserves conflict text; non-409 does not refresh", async () => {
  const { result } = await mount();
  let status = 409;
  api.fetch.mockImplementation(async (url: string, options: RequestInit) =>
    options.method === "GET"
      ? read(url)
      : response({ error: "Conflict/refusal" }, status),
  );
  let before = reads();
  await act(async () => {
    expect(await result.current.accept("a")).toBe(false);
  });
  expect(reads()).toBe(before + 1);
  expect(result.current.error).toBe("Conflict/refusal");
  status = 500;
  before = reads();
  await act(async () => {
    expect(await result.current.pickup("a")).toBe(false);
  });
  expect(reads()).toBe(before);
  expect(result.current.jobs[0]?.id).toBe("a");
});
it("current partial settlement failure keeps last-good side data and jobs available", async () => {
  const { result } = await mount();
  api.fetch.mockImplementation(async (url: string) =>
    url === "/api/rider/settlements"
      ? response({ error: "Side read unavailable" }, 503)
      : read(url),
  );
  await act(async () => {
    expect(await result.current.refresh()).toBe(true);
  });
  expect(result.current.jobs[0]?.id).toBe("a");
  expect(result.current.pendingClaim?.id).toBe("a");
  expect(result.current.claimsReady).toBe(false);
  expect(result.current.error).toBeNull();
});
it("current location refusal remains silent and keeps an existing error", async () => {
  const { result } = await mount();
  api.fetch.mockImplementation(async () =>
    response({ error: "Read failure" }, 503),
  );
  await act(async () => {
    await result.current.refresh();
  });
  const before = result.current.error;
  await act(async () => {
    expect(await result.current.updateLocation(1, 2)).toBe(false);
  });
  expect(result.current.error).toBe(before);
});
it("rider A → B → A never revives A's old mutation owner", async () => {
  const { result, rerender } = await mount();
  const pending = deferred<Response>();
  api.fetch.mockImplementation((url: string, options: RequestInit) =>
    options.method === "GET" ? Promise.resolve(read(url)) : pending.promise,
  );
  let flight!: Promise<boolean>;
  act(() => {
    flight = result.current.accept("a");
  });
  api.label = "b";
  rerender({ id: "b", enabled: true });
  await act(async () => {
    await result.current.refresh();
  });
  api.label = "a";
  rerender({ id: "a", enabled: true });
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    pending.resolve(response({ error: "Original A refusal" }, 409));
    expect(await flight).toBe(false);
  });
  expect(result.current.error).toBeNull();
});
it("disable/re-enable starts a fresh read owner without waiting for old transport", async () => {
  const old = deferred<Response>();
  api.fetch.mockImplementation(() => old.promise);
  const { result, rerender } = renderHook(
    ({ enabled }) => useRiderJobs(enabled, "a"),
    { initialProps: { enabled: true } },
  );
  rerender({ enabled: false });
  api.fetch.mockImplementation(async (url: string) => read(url));
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.jobs[0]?.id).toBe("a"));
  await act(async () => {
    old.resolve(response({ jobs: [{ id: "old" }], settlements: [] }));
  });
  expect(result.current.jobs[0]?.id).toBe("a");
  expect(result.current.loading).toBe(false);
});
it("jobs failure retains last-good jobs while current side-panel data can update", async () => {
  const { result } = await mount();
  api.label = "updated-side";
  api.fetch.mockImplementation(async (url: string) =>
    url === "/api/rider/jobs"
      ? response({ error: "Current jobs failed" }, 503)
      : read(url),
  );
  await act(async () => {
    expect(await result.current.refresh()).toBe(false);
  });
  expect(result.current.jobs[0]?.id).toBe("a");
  expect(result.current.pendingClaim?.id).toBe("updated-side");
  expect(result.current.error).toBe("Current jobs failed");
  expect(result.current.loading).toBe(false);
});
it("same-owner reads deduplicate and release their lock for explicit retry", async () => {
  const { result } = await mount();
  const pending = deferred<Response>();
  api.fetch.mockImplementation(() => pending.promise);
  const before = reads();
  let first!: Promise<boolean>, second!: Promise<boolean>;
  act(() => {
    first = result.current.refresh();
    second = result.current.refresh();
  });
  expect(reads()).toBe(before + 1);
  await act(async () => {
    pending.resolve(response({ jobs: [], settlements: [] }));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
  api.fetch.mockImplementation(async (url: string) => read(url));
  await act(async () => {
    await result.current.refresh();
  });
  expect(reads()).toBe(before + 2);
});
it("identity change during a mutation's follow-up refresh suppresses its completion", async () => {
  const { result, rerender } = await mount();
  const pendingRead = deferred<Response>();
  api.fetch.mockImplementation((url: string, options: RequestInit) =>
    options.method === "GET"
      ? pendingRead.promise
      : Promise.resolve(response({})),
  );
  let flight!: Promise<boolean>;
  act(() => {
    flight = result.current.deliver("a", "1234");
  });
  await waitFor(() => expect(result.current.loading).toBe(true));
  api.label = "b";
  api.fetch.mockImplementation(async (url: string) => read(url));
  rerender({ id: "b", enabled: true });
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    pendingRead.resolve(response({ jobs: [{ id: "old" }], settlements: [] }));
    expect(await flight).toBe(false);
  });
  expect(result.current.jobs[0]?.id).toBe("b");
  expect(result.current.error).toBeNull();
});
it("stale 409 cannot start conflict recovery in the newer scope", async () => {
  const { result, rerender } = await mount();
  const pending = deferred<Response>();
  api.fetch.mockImplementation((url: string, options: RequestInit) =>
    options.method === "GET" ? Promise.resolve(read(url)) : pending.promise,
  );
  let flight!: Promise<boolean>;
  act(() => {
    flight = result.current.reject("a");
  });
  api.label = "b";
  rerender({ id: "b", enabled: true });
  await act(async () => {
    await result.current.refresh();
  });
  const before = reads();
  await act(async () => {
    pending.resolve(response({ error: "Old conflict" }, 409));
    expect(await flight).toBe(false);
  });
  expect(reads()).toBe(before);
  expect(result.current.error).toBeNull();
});
it("disabled methods perform no network writes", async () => {
  const { result, rerender } = await mount();
  rerender({ id: "a", enabled: false });
  const before = api.fetch.mock.calls.length;
  await act(async () => {
    for (const entry of actions)
      expect(await entry.invoke(result.current)).toBe(false);
  });
  expect(api.fetch.mock.calls.length).toBe(before);
});
