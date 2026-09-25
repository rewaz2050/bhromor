/**
 * useRiderJobs — realtime offer push (speed pass, 2026-09-25).
 *
 * While the socket is subscribed the feed refreshes the instant this
 * rider's assignment rows change; the 15 s poll stays as the backup for
 * a dead socket, an unpublished table or a signed-out rider.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const channelState = vi.hoisted(() => ({
  onConfig: null as null | Record<string, unknown>,
  onCallback: null as null | (() => void),
  subscribeCallback: null as null | ((status: string) => void),
  channels: [] as string[],
  removed: 0,
}));

vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => ({
    channel: (name: string) => {
      channelState.channels.push(name);
      const channel = {
        on: (_event: string, config: Record<string, unknown>, cb: () => void) => {
          channelState.onConfig = config;
          channelState.onCallback = cb;
          return channel;
        },
        subscribe: (cb: (status: string) => void) => {
          channelState.subscribeCallback = cb;
          return channel;
        },
      };
      return channel;
    },
    removeChannel: () => {
      channelState.removed += 1;
    },
  }),
}));

import { useRiderJobs } from "../use-rider";

const jobsPayload = { jobs: [{ id: "asg-1", state: "offered" }] };
const settlementsPayload = { settlements: [], pendingClaim: null };

beforeEach(() => {
  channelState.onConfig = null;
  channelState.onCallback = null;
  channelState.subscribeCallback = null;
  channelState.channels = [];
  channelState.removed = 0;
  vi.restoreAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/api/rider/jobs")
        ? { ok: true, json: async () => jobsPayload }
        : { ok: true, json: async () => settlementsPayload },
    ),
  );
});

describe("useRiderJobs realtime subscription", () => {
  it("subscribes to this rider's assignment rows only", async () => {
    const { result, unmount } = renderHook(() => useRiderJobs(true, "rider-1"));
    await waitFor(() => expect(channelState.channels).toEqual(["rider-jobs:rider-1"]));
    expect(channelState.onConfig).toMatchObject({
      event: "*",
      schema: "public",
      table: "delivery_assignments",
      filter: "rider_id=eq.rider-1",
    });
    expect(result.current.live).toBe(false);
    unmount();
  });

  it("marks the feed live on SUBSCRIBED and refreshes on every event", async () => {
    const { result, unmount } = renderHook(() => useRiderJobs(true, "rider-1"));
    await waitFor(() => expect(channelState.subscribeCallback).not.toBeNull());
    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(fetchCalls).toBeGreaterThan(0); // initial refresh

    act(() => {
      channelState.subscribeCallback?.("SUBSCRIBED");
    });
    expect(result.current.live).toBe(true);

    await act(async () => {
      channelState.onCallback?.();
    });
    await waitFor(() =>
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(fetchCalls),
    );
    unmount();
  });

  it("drops back to polling when the socket errors", async () => {
    const { result, unmount } = renderHook(() => useRiderJobs(true, "rider-1"));
    await waitFor(() => expect(channelState.subscribeCallback).not.toBeNull());
    act(() => {
      channelState.subscribeCallback?.("SUBSCRIBED");
    });
    expect(result.current.live).toBe(true);
    act(() => {
      channelState.subscribeCallback?.("CHANNEL_ERROR");
    });
    expect(result.current.live).toBe(false);
    unmount();
  });

  it("opens no channel without a rider id, and removes it on unmount", async () => {
    const guest = renderHook(() => useRiderJobs(true, null));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(channelState.channels).toEqual([]);
    guest.unmount();

    const { unmount } = renderHook(() => useRiderJobs(true, "rider-1"));
    await waitFor(() => expect(channelState.channels).toEqual(["rider-jobs:rider-1"]));
    unmount();
    expect(channelState.removed).toBe(1);
  });
});
