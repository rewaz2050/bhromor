/**
 * The customer's live rider position: HTTP polling as the honest baseline, and
 * the rider's Realtime broadcast on top of it once the first read hands back a
 * channel name. These pin the two things that could silently break the feature
 * — that it still works with no socket at all, and that a socket can never
 * make the pin lie (a late or malformed message must not move it backwards).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  BACKUP_POLL_MS,
  LIVE_POLL_MS,
  useLiveRiderPosition,
} from "../use-live-rider-position";

const ORDER = "PS-20261008-0042";
const PHONE = "01711111111";
const CHANNEL = "track:0123456789abcdef01234567";

const state = vi.hoisted(() => ({
  response: null as Record<string, unknown> | null,
  status: 200,
  subscribed: [] as string[],
  handlers: [] as ((msg: unknown) => void)[],
  subscribeStatus: "SUBSCRIBED",
  removed: [] as string[],
}));

vi.mock("../supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    channel: (name: string) => {
      state.subscribed.push(name);
      return {
        on: (_type: string, _filter: unknown, handler: (msg: unknown) => void) => {
          state.handlers.push(handler);
          return { subscribe: (cb: (s: string) => void) => { cb(state.subscribeStatus); return {}; } };
        },
        subscribe: () => ({}),
      };
    },
    removeChannel: (ch: { name?: string }) => {
      state.removed.push(ch?.name ?? "?");
    },
  }),
}));

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> };

const stubFetch = () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<FetchResult>>(async () => ({
    ok: state.status === 200,
    status: state.status,
    json: async () => state.response,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const broadcast = (payload: unknown) => {
  for (const h of state.handlers) h({ payload });
};

beforeEach(() => {
  state.response = { lat: 25.0703, lng: 91.4067, updatedAt: "2026-10-08T10:00:00Z", liveChannel: CHANNEL };
  state.status = 200;
  state.subscribed = [];
  state.handlers = [];
  state.subscribeStatus = "SUBSCRIBED";
  state.removed = [];
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useLiveRiderPosition", () => {
  it("reads the position on mount and keeps polling every 10 s while the tab is visible", async () => {
    vi.useFakeTimers();
    // No channel offered → no socket → the poll IS the channel.
    state.response = { lat: 25.0703, lng: 91.4067, updatedAt: "2026-10-08T10:00:00Z" };
    const fetchMock = stubFetch();
    renderHook(() => useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`orderId=${ORDER}`);
    await act(async () => {
      vi.advanceTimersByTime(LIVE_POLL_MS * 2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does nothing at all until the parcel is on the road", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    renderHook(() => useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: false }));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("subscribes to the channel the server hands back, and calls it live", async () => {
    stubFetch();
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(result.current.rider).not.toBeNull());
    await waitFor(() => expect(state.subscribed).toContain(CHANNEL));
    await waitFor(() => expect(result.current.live).toBe(true));
  });

  it("a broadcast moves the pin immediately", async () => {
    stubFetch();
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(result.current.rider?.lat).toBeCloseTo(25.0703));
    const at = Date.parse("2026-10-08T10:05:00Z");
    await act(async () => {
      broadcast({ lat: 25.0803, lng: 91.4167, at });
    });
    expect(result.current.rider?.lat).toBeCloseTo(25.0803);
    expect(result.current.rider?.lng).toBeCloseTo(91.4167);
  });

  it("slows the poll to the backup rate while the socket is up", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    renderHook(() => useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Socket subscribed → the timer is the backup, not the primary.
    expect(BACKUP_POLL_MS).toBeGreaterThan(LIVE_POLL_MS);
    const afterMount = fetchMock.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(LIVE_POLL_MS);
    });
    expect(fetchMock.mock.calls.length).toBe(afterMount); // no tick at 10 s
    await act(async () => {
      vi.advanceTimersByTime(BACKUP_POLL_MS);
    });
    expect(fetchMock.mock.calls.length).toBe(afterMount + 1);
  });

  it("ignores a broadcast older than the fix already on screen", async () => {
    stubFetch();
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(result.current.rider).not.toBeNull());
    await act(async () => {
      broadcast({ lat: 25.09, lng: 91.42, at: Date.parse("2026-10-08T10:09:00Z") });
    });
    expect(result.current.rider?.lat).toBeCloseTo(25.09);
    await act(async () => {
      // A late message from two minutes earlier must not drag the pin back.
      broadcast({ lat: 25.01, lng: 91.30, at: Date.parse("2026-10-08T10:07:00Z") });
    });
    expect(result.current.rider?.lat).toBeCloseTo(25.09);
  });

  it.each([
    ["no coordinates", { at: 1 }],
    ["NaN", { lat: NaN, lng: 91.4, at: Date.now() }],
    ["out of range", { lat: 999, lng: 91.4, at: Date.now() }],
    ["null payload", null],
  ])("drops a broadcast with %s", async (_label, payload) => {
    stubFetch();
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(result.current.rider?.lat).toBeCloseTo(25.0703));
    await act(async () => {
      broadcast(payload);
    });
    expect(result.current.rider?.lat).toBeCloseTo(25.0703);
  });

  it("keeps working with no socket at all — polling is the fallback, not a nicety", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ lat: 25.07, lng: 91.4, updatedAt: "2026-10-08T10:00:00Z" }),
    })));
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(result.current.rider?.lat).toBeCloseTo(25.07));
    expect(result.current.live).toBe(false);
    expect(state.subscribed).toEqual([]);
  });

  it("survives a 404 with no fix yet, and still learns the channel", async () => {
    state.status = 404;
    state.response = { error: "rider location not available yet", liveChannel: CHANNEL };
    stubFetch();
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(state.subscribed).toContain(CHANNEL));
    expect(result.current.rider).toBeNull();
  });

  it("survives a network failure without losing the last known position", async () => {
    stubFetch();
    const { result } = renderHook(() =>
      useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled: true }),
    );
    await waitFor(() => expect(result.current.rider).not.toBeNull());
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.rider?.lat).toBeCloseTo(25.0703);
  });

  it("leaves the channel when the order stops being tracked", async () => {
    stubFetch();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLiveRiderPosition({ orderId: ORDER, phone: PHONE, enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(state.subscribed).toContain(CHANNEL));
    rerender({ enabled: false });
    await waitFor(() => expect(state.removed.length).toBeGreaterThan(0));
  });
});
