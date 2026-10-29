import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useVendorEarnings, useVendorOrder } from "../use-vendor";
import { useRiderStats } from "../use-rider";
import { useRiderRating } from "../use-rider-rating";

vi.mock("../supabase-browser", () => ({ getSupabaseBrowser: () => null }));
vi.mock("../use-poll", () => ({ usePoll: vi.fn() }));
const request = vi.fn();
const response = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("O05: masks the previous vendor order while the new ID is pending", async () => {
  const next = deferred<unknown>();
  request
    .mockResolvedValueOnce(response({ order: { id: "A" } }))
    .mockReturnValueOnce(next.promise);
  const { result, rerender } = renderHook(
    ({ id }) => useVendorOrder(true, id),
    { initialProps: { id: "A" } },
  );
  await waitFor(() => expect(result.current.order?.id).toBe("A"));
  rerender({ id: "B" });
  expect(result.current.order).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => {
    next.resolve(response({ order: { id: "B" } }));
  });
  expect(result.current.order?.id).toBe("B");
});
it("O05: clears previous ID errors and ignores a late old-ID failure", async () => {
  const old = deferred<unknown>();
  request
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(response({ order: { id: "B" } }));
  const { result, rerender } = renderHook(
    ({ id }) => useVendorOrder(true, id),
    { initialProps: { id: "A" } },
  );
  rerender({ id: "B" });
  await waitFor(() => expect(result.current.order?.id).toBe("B"));
  await act(async () => {
    old.reject(new Error("Offline"));
  });
  expect(result.current.error).toBeNull();
  expect(result.current.order?.id).toBe("B");
});
const validStats = {
  totalDeliveries: 10,
  weekDeliveries: 3,
  ratingAvg: 4,
  ratingCount: 2,
  earningsBalance: 1234,
};
const resources = [
  {
    name: "O06 vendor earnings",
    useResource: (enabled: boolean) => {
      const r = useVendorEarnings(enabled);
      return { value: r.earnings, loading: r.loading };
    },
    body: { earnings: { gross: 1234 } },
  },
  {
    name: "O07 rider stats",
    useResource: (enabled: boolean) => {
      const r = useRiderStats(enabled);
      return { value: r.stats, loading: r.loading };
    },
    body: { stats: validStats },
  },
  {
    name: "O07 rider rating",
    useResource: (enabled: boolean) => {
      const r = useRiderRating(enabled);
      return { value: r.summary, loading: r.loading };
    },
    body: { summary: { avg: 4, count: 2 } },
  },
];
for (const resource of resources) {
  it(`${resource.name}: clears committed data on disable and re-enable`, async () => {
    const next = deferred<unknown>();
    request
      .mockResolvedValueOnce(response(resource.body))
      .mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(
      ({ enabled }) => resource.useResource(enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.value).not.toBeNull());
    rerender({ enabled: false });
    expect(result.current.value).toBeNull();
    expect(result.current.loading).toBe(false);
    rerender({ enabled: true });
    expect(result.current.value).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => {
      next.resolve(response(resource.body));
    });
    expect(result.current.value).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });
  it(`${resource.name}: ignores old-session responses even after re-enabling`, async () => {
    const old = deferred<unknown>();
    const next = deferred<unknown>();
    request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(
      ({ enabled }) => resource.useResource(enabled),
      { initialProps: { enabled: true } },
    );
    rerender({ enabled: false });
    rerender({ enabled: true });
    await act(async () => {
      old.resolve(response(resource.body));
    });
    expect(result.current.value).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => {
      next.resolve(response(resource.body));
    });
    expect(result.current.value).not.toBeNull();
  });
}
it("O07: a later stats refresh owns the result and loading state", async () => {
  const old = deferred<unknown>();
  request
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(
      response({ stats: { ...validStats, totalDeliveries: 99 } }),
    );
  const { result } = renderHook(() => useRiderStats(true));
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    old.resolve(response({ stats: validStats }));
  });
  expect(result.current.stats?.totalDeliveries).toBe(99);
  expect(result.current.loading).toBe(false);
});

it("O05/O06: a vendor retry preserves same-context rows and clears a recovered error", async () => {
  request.mockResolvedValueOnce(response({ order: { id: "A" } }));
  const { result } = renderHook(() => useVendorOrder(true, "A"));
  await waitFor(() => expect(result.current.order?.id).toBe("A"));
  request.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => {
    result.current.reload();
  });
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.order?.id).toBe("A");
  expect(result.current.loading).toBe(false);
  request.mockResolvedValueOnce(
    response({ order: { id: "A", status: "confirmed" } }),
  );
  await act(async () => {
    await result.current.refresh();
  });
  await waitFor(() => expect(result.current.error).toBeNull());
  await waitFor(() => expect(result.current.order?.status).toBe("confirmed"));
});
it("O05: null resource IDs do not expose data or issue reads", async () => {
  request.mockResolvedValueOnce(response({ order: { id: "A" } }));
  const { result, rerender } = renderHook(
    ({ id }) => useVendorOrder(true, id),
    { initialProps: { id: "A" } },
  );
  await waitFor(() => expect(result.current.order?.id).toBe("A"));
  rerender({ id: "" });
  expect(result.current.order).toBeNull();
  expect(result.current.loading).toBe(false);
  act(() => {
    result.current.refresh();
    result.current.reload();
  });
  expect(request).toHaveBeenCalledTimes(1);
});
it("O06: a disabled vendor resource does not read through saved refresh callbacks", async () => {
  request.mockResolvedValueOnce(response({ earnings: { gross: 1234 } }));
  const { result, rerender } = renderHook(
    ({ enabled }) => useVendorEarnings(enabled),
    { initialProps: { enabled: true } },
  );
  await waitFor(() => expect(result.current.earnings).not.toBeNull());
  const refresh = result.current.refresh;
  rerender({ enabled: false });
  act(() => {
    refresh();
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.current.earnings).toBeNull();
});
it("O06: a late old-session vendor failure cannot clear the new loading state", async () => {
  const old = deferred<unknown>();
  const next = deferred<unknown>();
  request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const { result, rerender } = renderHook(
    ({ enabled }) => useVendorEarnings(enabled),
    { initialProps: { enabled: true } },
  );
  rerender({ enabled: false });
  rerender({ enabled: true });
  await act(async () => {
    old.reject(new Error("Old session offline"));
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBeNull();
  await act(async () => {
    next.resolve(response({ earnings: { gross: 42 } }));
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.earnings).toEqual({ gross: 42 });
});

it("O05/O06: StrictMode cleanup invalidates the discarded mount's response", async () => {
  const old = deferred<unknown>();
  request
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(
      response({ order: { id: "A", status: "confirmed" } }),
    );
  const { result } = renderHook(() => useVendorOrder(true, "A"), {
    reactStrictMode: true,
  });
  await waitFor(() => expect(result.current.order?.status).toBe("confirmed"));
  await act(async () => {
    old.resolve(response({ order: { id: "A", status: "pending" } }));
  });
  expect(result.current.order?.status).toBe("confirmed");
});
