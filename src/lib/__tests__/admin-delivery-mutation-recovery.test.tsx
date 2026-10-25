import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAdminDeliveries } from "../use-admin-deliveries";
const api = vi.hoisted(() => ({ live: true, get: vi.fn(), send: vi.fn() }));
vi.mock("../use-riders", () => ({
  RIDERS_POLL_MS: 30000,
  useRiders: () => ({
    live: api.live,
    loading: false,
    error: null,
    riders: [],
    dispatch: {},
    reset: vi.fn(),
  }),
}));
vi.mock("../admin-api", () => ({
  apiGet: api.get,
  apiSend: api.send,
  apiErrorMessage: (error: Error) => error.message,
}));
vi.mock("../use-poll", () => ({ usePoll: vi.fn() }));
type Board = ReturnType<typeof useAdminDeliveries>;
const actions = [
  {
    name: "offer",
    run: (board: Board) => board.offer("order/one"),
    path: "/api/admin/deliveries/offer",
    body: { orderId: "order/one" },
    busy: "order/one",
  },
  {
    name: "cancel",
    run: (board: Board) => board.cancel("job/one"),
    path: "/api/admin/deliveries/job%2Fone/cancel",
    body: undefined,
    busy: "job/one",
  },
  {
    name: "release",
    run: (board: Board) => board.release("job/one", "Fixture reason"),
    path: "/api/admin/deliveries/job%2Fone/release",
    body: { reason: "Fixture reason" },
    busy: "job/one",
  },
  {
    name: "resolveFailed",
    run: (board: Board) =>
      board.resolveFailed("order/one", "cancel", "Fixture note", true),
    path: "/api/admin/orders/order%2Fone/failed-delivery",
    body: { action: "cancel", note: "Fixture note", payFee: true },
    busy: "order/one",
  },
];
const snapshot = () => ({
  deliveries: [{ id: "job/one", state: "offered" }],
  awaitingOrders: [],
  failedDeliveries: [],
});
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  api.live = true;
  api.get.mockReset();
  api.send.mockReset();
  api.get.mockResolvedValue(snapshot());
});
afterEach(cleanup);
async function mount() {
  const hook = renderHook(() => useAdminDeliveries());
  await waitFor(() => expect(hook.result.current.deliveries).toHaveLength(1));
  return hook;
}
it.each(actions)("saved $name does not send after disable", async (action) => {
  const { result, rerender } = await mount();
  const saved = result.current;
  api.live = false;
  rerender();
  await act(async () => {
    expect(await action.run(saved)).toBe(false);
  });
  expect(api.send).not.toHaveBeenCalled();
  expect(result.current.busyId).toBeNull();
});
it.each(actions)(
  "saved $name cannot act on a later enabled lifetime",
  async (action) => {
    const { result, rerender } = await mount();
    const saved = result.current;
    api.live = false;
    rerender();
    api.live = true;
    rerender();
    await waitFor(() => expect(result.current.deliveries).toHaveLength(1));
    await act(async () => {
      expect(await action.run(saved)).toBe(false);
    });
    expect(api.send).not.toHaveBeenCalled();
  },
);
it.each(actions)(
  "pending $name failure cannot set a signed-out error",
  async (action) => {
    const pending = deferred();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await mount();
    let operation!: Promise<boolean>;
    act(() => {
      operation = action.run(result.current);
    });
    api.live = false;
    rerender();
    await act(async () => {
      pending.reject(new Error("Old mutation failed"));
      expect(await operation).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busyId).toBeNull();
  },
);
it.each(actions)(
  "pending $name success cannot refresh or clear a later session's read error",
  async (action) => {
    const pending = deferred();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await mount();
    let operation!: Promise<boolean>;
    act(() => {
      operation = action.run(result.current);
    });
    api.live = false;
    rerender();
    api.get.mockRejectedValue(new Error("Current read failed"));
    api.live = true;
    rerender();
    await waitFor(() =>
      expect(result.current.error).toBe("Current read failed"),
    );
    api.get.mockClear();
    await act(async () => {
      pending.resolve({ ok: true });
      expect(await operation).toBe(false);
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Current read failed");
  },
);
it.each(actions)(
  "pending $name failure cannot overwrite a later session's read error",
  async (action) => {
    const pending = deferred();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await mount();
    let operation!: Promise<boolean>;
    act(() => {
      operation = action.run(result.current);
    });
    api.live = false;
    rerender();
    api.get.mockRejectedValue(new Error("Current read failed"));
    api.live = true;
    rerender();
    await waitFor(() =>
      expect(result.current.error).toBe("Current read failed"),
    );
    await act(async () => {
      pending.reject(new Error("Old mutation failed"));
      expect(await operation).toBe(false);
    });
    expect(result.current.error).toBe("Current read failed");
  },
);
it.each(actions)(
  "$name completion after unmount cannot refresh",
  async (action) => {
    const pending = deferred();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, unmount } = await mount();
    let operation!: Promise<boolean>;
    act(() => {
      operation = action.run(result.current);
    });
    unmount();
    api.get.mockClear();
    await act(async () => {
      pending.resolve({ ok: true });
      expect(await operation).toBe(false);
    });
    expect(api.get).not.toHaveBeenCalled();
  },
);
it.each(
  actions.flatMap((action) =>
    ["success", "failure"].map((outcome) => ({ ...action, outcome })),
  ),
)(
  "older $name $outcome cannot unlock or change a newer mutation",
  async (action) => {
    const old = deferred(),
      current = deferred();
    api.send
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result } = await mount();
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = action.run(result.current);
    });
    act(() => {
      second = result.current.offer("new-order");
    });
    api.get.mockClear();
    await act(async () => {
      if (action.outcome === "success") old.resolve({ ok: true });
      else old.reject(new Error("Old failed"));
      expect(await first).toBe(false);
    });
    expect(result.current.busyId).toBe("new-order");
    expect(result.current.error).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    await act(async () => {
      current.resolve({ ok: true });
      expect(await second).toBe(true);
    });
    expect(result.current.busyId).toBeNull();
  },
);
it.each(actions)(
  "current $name keeps endpoint/payload and refreshes on success",
  async (action) => {
    const { result } = await mount();
    api.send.mockResolvedValue({ ok: true });
    api.get.mockClear();
    await act(async () => {
      expect(await action.run(result.current)).toBe(true);
    });
    if (action.body === undefined)
      expect(api.send).toHaveBeenCalledWith(action.path, "POST");
    else
      expect(api.send).toHaveBeenCalledWith(action.path, "POST", action.body);
    expect(api.get).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
    expect(result.current.busyId).toBeNull();
  },
);

it.each(actions)(
  "current $name failure keeps its message and clears its own busy state",
  async (action) => {
    const { result } = await mount();
    api.send.mockRejectedValueOnce(new Error("Current action refused"));
    api.get.mockClear();
    await act(async () => {
      expect(await action.run(result.current)).toBe(false);
    });
    expect(result.current.error).toBe("Current action refused");
    expect(result.current.busyId).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  },
);
it.each(actions)(
  "old $name completion cannot clear a newly enabled session's pending action",
  async (action) => {
    const old = deferred(),
      current = deferred();
    api.send
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result, rerender } = await mount();
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = action.run(result.current);
    });
    api.live = false;
    rerender();
    api.live = true;
    rerender();
    await waitFor(() => expect(result.current.deliveries).toHaveLength(1));
    act(() => {
      second = result.current.offer("new-session-order");
    });
    api.get.mockClear();
    await act(async () => {
      old.resolve({ ok: true });
      expect(await first).toBe(false);
    });
    expect(result.current.busyId).toBe("new-session-order");
    expect(api.get).not.toHaveBeenCalled();
    await act(async () => {
      current.resolve({ ok: true });
      expect(await second).toBe(true);
    });
    expect(result.current.busyId).toBeNull();
  },
);
it("ownership is rechecked after the post-mutation refresh awaits", async () => {
  const { result, rerender } = await mount();
  const refresh = deferred();
  api.get.mockReturnValueOnce(refresh.promise);
  api.send.mockResolvedValue({ ok: true });
  let operation!: Promise<boolean>;
  act(() => {
    operation = result.current.offer("old-order");
  });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  api.live = false;
  rerender();
  api.live = true;
  rerender();
  await waitFor(() => expect(result.current.deliveries).toHaveLength(1));
  await act(async () => {
    refresh.resolve(snapshot());
    expect(await operation).toBe(false);
  });
  expect(result.current.busyId).toBeNull();
  expect(result.current.error).toBeNull();
});
it("a current committed mutation remains successful if its subsequent read fails", async () => {
  const { result } = await mount();
  api.send.mockResolvedValue({ ok: true });
  api.get.mockRejectedValue(new Error("Refresh failed"));
  await act(async () => {
    expect(await result.current.offer("order")).toBe(true);
  });
  expect(result.current.error).toBe("Refresh failed");
  expect(result.current.busyId).toBeNull();
});
it("keeps resolveFailed defaults without inventing a rider-fee override", async () => {
  const { result } = await mount();
  api.send.mockResolvedValue({ ok: true });
  await act(async () => {
    expect(await result.current.resolveFailed("order", "redispatch")).toBe(
      true,
    );
  });
  expect(api.send).toHaveBeenCalledWith(
    "/api/admin/orders/order/failed-delivery",
    "POST",
    { action: "redispatch", note: "" },
  );
});
it("cancel still rejects missing or non-offered assignments before sending", async () => {
  api.get.mockResolvedValue({
    ...snapshot(),
    deliveries: [{ id: "job/one", state: "accepted" }],
  });
  const { result } = await mount();
  await act(async () => {
    expect(await result.current.cancel("missing")).toBe(false);
    expect(await result.current.cancel("job/one")).toBe(false);
  });
  expect(api.send).not.toHaveBeenCalled();
});
