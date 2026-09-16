// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authed: true,
  probe: { staff: false, status: 0, reason: "Could not reach the server." } as {
    staff: boolean;
    status: number;
    reason?: string;
  },
  calls: 0,
}));

vi.mock("../admin-auth", async () => {
  const actual = await vi.importActual<typeof import("../admin-auth")>(
    "../admin-auth",
  );
  return {
    ...actual,
    getAdminAuthed: () => state.authed,
    subscribeAdminAuth: () => () => {},
    probeStaffSession: async () => {
      state.calls += 1;
      return state.probe;
    },
  };
});

import { __resetStaffProbe, useStaffLive } from "../use-staff-live";

describe("useStaffLive", () => {
  beforeEach(() => {
    __resetStaffProbe();
    state.calls = 0;
    state.authed = true;
  });
  afterEach(() => __resetStaffProbe());

  it("reports live with no error when the probe confirms staff", async () => {
    state.probe = { staff: true, status: 200 };
    const { result } = renderHook(() => useStaffLive());
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.live).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("surfaces why the session is not live instead of pretending 'no data'", async () => {
    state.probe = { staff: false, status: 0, reason: "Could not reach the server." };
    const { result } = renderHook(() => useStaffLive());
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.live).toBe(false);
    expect(result.current.error).toMatch(/could not reach the server/i);
  });

  it("names the 5xx when the server itself failed", async () => {
    state.probe = { staff: false, status: 502 };
    const { result } = renderHook(() => useStaffLive());
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.error).toMatch(/HTTP 502/);
  });

  it("retry re-probes (the module cache is cleared) and recovers", async () => {
    state.probe = { staff: false, status: 0 };
    const { result } = renderHook(() => useStaffLive());
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.live).toBe(false);
    expect(state.calls).toBe(1);

    state.probe = { staff: true, status: 200 };
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.live).toBe(true));
    expect(result.current.error).toBeNull();
    expect(state.calls).toBe(2);
  });

  it("is checked-and-not-live with no error when the browser is signed out", async () => {
    state.authed = false;
    const { result } = renderHook(() => useStaffLive());
    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.live).toBe(false);
    expect(result.current.error).toBeNull();
    expect(state.calls).toBe(0);
  });
});
