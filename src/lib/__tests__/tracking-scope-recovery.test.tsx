import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { asFix, useLiveRiderPosition } from "../use-live-rider-position";

const socket = vi.hoisted(() => ({
  names: [] as string[],
  messages: [] as ((msg: unknown) => void)[],
  statuses: [] as ((status: string) => void)[],
  removed: vi.fn(),
}));
vi.mock("../supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    channel: (name: string) => {
      socket.names.push(name);
      return {
        on: (_type: string, _filter: unknown, cb: (msg: unknown) => void) => {
          socket.messages.push(cb);
          return {
            subscribe: (status: (s: string) => void) => {
              socket.statuses.push(status);
              status("SUBSCRIBED");
              return { name };
            },
          };
        },
      };
    },
    removeChannel: socket.removed,
  }),
}));
vi.mock("../use-poll", () => ({ usePoll: vi.fn() }));
const request = vi.fn();
const response = (lat: number, at: string, channel: string) => ({
  ok: true,
  json: async () => ({ lat, lng: 91.4, updatedAt: at, liveChannel: channel }),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  request.mockReset();
  socket.names = [];
  socket.messages = [];
  socket.statuses = [];
  socket.removed.mockClear();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const options = {
  orderId: "A",
  phone: "01711111111",
  trackToken: "token-a",
  enabled: true,
};
it("O09: applies the same zero-pair and finite-coordinate policy as the map", () => {
  expect(asFix({ lat: 0, lng: 0 })).toBeNull();
  expect(asFix({ lat: 0, lng: 91 })).toEqual({ lat: 0, lng: 91 });
  expect(asFix({ lat: NaN, lng: 91 })).toBeNull();
});
it.each(["orderId", "phone", "trackToken"] as const)(
  "O08: resets fix, clock and channel when %s changes",
  async (key) => {
    const next = deferred<unknown>();
    request
      .mockResolvedValueOnce(
        response(25.08, "2026-10-22T12:00:00Z", "channel-a"),
      )
      .mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(
      (props) => useLiveRiderPosition(props),
      { initialProps: options },
    );
    await waitFor(() => expect(result.current.live).toBe(true));
    rerender({ ...options, [key]: "new-value" });
    expect(result.current.rider).toBeNull();
    expect(result.current.live).toBe(false);
    expect(socket.removed).toHaveBeenCalled();
    await act(async () => {
      next.resolve(response(25.09, "2026-10-22T11:59:00Z", "channel-b"));
    });
    expect(result.current.rider?.lat).toBe(25.09);
    expect(socket.names).toEqual(["channel-a", "channel-b"]);
    // A detached socket can still deliver queued callbacks. They cannot update B.
    act(() => {
      socket.messages[0]({
        payload: {
          lat: 25.5,
          lng: 91.5,
          at: Date.parse("2026-10-22T13:00:00Z"),
        },
      });
      socket.statuses[0]("CLOSED");
    });
    expect(result.current.rider?.lat).toBe(25.09);
    expect(result.current.live).toBe(true);
  },
);
it("O08: rejects a late HTTP response and channel from the old order", async () => {
  const old = deferred<unknown>();
  request
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(
      response(25.09, "2026-10-22T11:59:00Z", "channel-b"),
    );
  const { result, rerender } = renderHook(
    (props) => useLiveRiderPosition(props),
    { initialProps: options },
  );
  rerender({ ...options, orderId: "B" });
  await waitFor(() => expect(result.current.rider?.lat).toBe(25.09));
  await act(async () => {
    old.resolve(response(25.08, "2026-10-22T12:00:00Z", "channel-a"));
  });
  expect(result.current.rider?.lat).toBe(25.09);
  expect(socket.names).toEqual(["channel-b"]);
});
it("O08: clears rider and live state while disabled", async () => {
  request.mockResolvedValue(
    response(25.08, "2026-10-22T12:00:00Z", "channel-a"),
  );
  const { result, rerender } = renderHook(
    (props) => useLiveRiderPosition(props),
    { initialProps: options },
  );
  await waitFor(() => expect(result.current.live).toBe(true));
  rerender({ ...options, enabled: false });
  expect(result.current.rider).toBeNull();
  expect(result.current.live).toBe(false);
});
it("O08: ignores a malformed broadcast timestamp rather than throwing", async () => {
  request.mockResolvedValue(
    response(25.08, "2026-10-22T12:00:00Z", "channel-a"),
  );
  const { result } = renderHook((props) => useLiveRiderPosition(props), {
    initialProps: options,
  });
  await waitFor(() => expect(result.current.live).toBe(true));
  expect(() =>
    act(() =>
      socket.messages[0]({ payload: { lat: 25.5, lng: 91.5, at: Infinity } }),
    ),
  ).not.toThrow();
  expect(result.current.rider?.lat).toBe(25.08);
});
