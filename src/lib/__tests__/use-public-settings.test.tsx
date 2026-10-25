import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPublicSettingsForTests, usePublicSettings } from "../use-public-settings";
import { SETTINGS_DEFAULTS } from "../settings-store";
beforeEach(() => { __resetPublicSettingsForTests(); });
afterEach(() => { cleanup(); __resetPublicSettingsForTests(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("public settings bounded reads", () => {
  it("deduplicates consumers and caches a successful response", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ settings: SETTINGS_DEFAULTS }) }));
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => usePublicSettings());
    const second = renderHook(() => usePublicSettings());
    await act(async () => {});
    expect(first.result.current.loading).toBe(false);
    expect(second.result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const third = renderHook(() => usePublicSettings());
    expect(third.result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves loading after a stalled body and permits a later fresh read", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: SETTINGS_DEFAULTS }) });
    vi.stubGlobal("fetch", fetchMock);
    const first = renderHook(() => usePublicSettings());
    const second = renderHook(() => usePublicSettings());
    await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
    expect(first.result.current.loading).toBe(false);
    expect(second.result.current.loading).toBe(false);
    expect(first.result.current.settings).toBe(SETTINGS_DEFAULTS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    renderHook(() => usePublicSettings());
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
