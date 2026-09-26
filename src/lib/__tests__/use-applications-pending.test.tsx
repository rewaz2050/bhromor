/**
 * Pending-application counts for the admin badge/banner (apply = sign up,
 * 2026-09-26): fetched once when live, polled while the tab is visible,
 * zero (and no request) when there is no staff session.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  live: true,
  counts: { shops: 2, riders: 1 } as { shops: number; riders: number } | Error,
  calls: 0,
  polls: [] as { intervalMs: number; enabled: boolean }[],
}));

vi.mock("../use-staff-live", () => ({
  useStaffLive: () => ({ live: state.live, checked: true, error: null, retry: () => {} }),
}));
vi.mock("../admin-api", () => ({
  apiGet: async () => {
    state.calls += 1;
    if (state.counts instanceof Error) throw state.counts;
    return state.counts;
  },
}));
vi.mock("../use-poll", () => ({
  usePoll: (_fn: unknown, intervalMs: number, enabled: boolean) => {
    state.polls.push({ intervalMs, enabled });
  },
}));

import { APPLICATIONS_POLL_MS, useApplicationsPending } from "../use-applications-pending";

beforeEach(() => {
  state.live = true;
  state.counts = { shops: 2, riders: 1 };
  state.calls = 0;
  state.polls = [];
});
afterEach(cleanup);

describe("useApplicationsPending", () => {
  it("loads the counts once live and exposes the total", async () => {
    const { result } = renderHook(() => useApplicationsPending());
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.shops).toBe(2);
    expect(result.current.riders).toBe(1);
    expect(state.calls).toBe(1);
  });

  it("arms the visibility-aware poll at the documented cadence while live", async () => {
    const { result } = renderHook(() => useApplicationsPending());
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(state.polls.at(-1)).toEqual({ intervalMs: APPLICATIONS_POLL_MS, enabled: true });
    expect(APPLICATIONS_POLL_MS).toBeGreaterThanOrEqual(15_000);
  });

  it("stays at zero and never calls the API without a staff session", async () => {
    state.live = false;
    const { result } = renderHook(() => useApplicationsPending());
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual({ shops: 0, riders: 0, total: 0 });
    expect(state.calls).toBe(0);
    expect(state.polls.at(-1)?.enabled).toBe(false);
  });

  it("swallows a failed count instead of breaking the shell", async () => {
    state.counts = new Error("boom");
    const { result } = renderHook(() => useApplicationsPending());
    await waitFor(() => expect(state.calls).toBe(1));
    expect(result.current.total).toBe(0);
  });
});
