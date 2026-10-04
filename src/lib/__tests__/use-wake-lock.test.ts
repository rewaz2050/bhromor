import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useKeepAwakePref, useWakeLock, wakeLockSupported } from "../use-wake-lock";

let visibility: DocumentVisibilityState = "visible";
const sentinels: { release: ReturnType<typeof vi.fn>; fire: () => void }[] = [];
const request = vi.fn(async () => {
  let cb: () => void = () => {};
  const s = { release: vi.fn(async () => {}), addEventListener: (_: string, f: () => void) => (cb = f), fire: () => cb() };
  sentinels.push(s);
  return s;
});

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  sentinels.length = 0;
  request.mockClear();
  vi.stubGlobal("navigator", { wakeLock: { request } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("useWakeLock", () => {
  it("is unsupported and harmless without the API", () => {
    vi.stubGlobal("navigator", {});
    expect(wakeLockSupported()).toBe(false);
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current).toEqual({ supported: false, held: false });
  });

  it("holds the lock while active and releases it when switched off or unmounted", async () => {
    const { result, rerender, unmount } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.held).toBe(true));
    expect(request).toHaveBeenCalledWith("screen");
    rerender({ on: false });
    expect(sentinels[0].release).toHaveBeenCalled();
    expect(result.current.held).toBe(false);
    rerender({ on: true });
    await waitFor(() => expect(sentinels).toHaveLength(2));
    unmount();
    expect(sentinels[1].release).toHaveBeenCalled();
  });

  it("does not ask while the page is hidden, and asks again when it comes back", async () => {
    visibility = "hidden";
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current.held).toBe(true));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("re-acquires after the browser releases the lock (page was hidden)", async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current.held).toBe(true));
    act(() => sentinels[0].fire());
    expect(result.current.held).toBe(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(result.current.held).toBe(true));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("a refusal (battery saver) leaves held=false without throwing", async () => {
    request.mockRejectedValueOnce(new Error("NotAllowedError"));
    const { result } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(result.current).toEqual({ supported: true, held: false });
  });

  it("a lock that arrives after unmount is released at once", async () => {
    let resolve!: (v: unknown) => void;
    const late = { release: vi.fn(async () => {}), addEventListener: () => {} };
    request.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never);
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    resolve(late);
    await waitFor(() => expect(late.release).toHaveBeenCalled());
  });
});

describe("useKeepAwakePref", () => {
  it("defaults to on and remembers the rider's choice on the device", () => {
    const first = renderHook(() => useKeepAwakePref());
    expect(first.result.current[0]).toBe(true);
    act(() => first.result.current[1](false));
    expect(first.result.current[0]).toBe(false);
    expect(window.localStorage.getItem("prosanti-rider-keep-awake")).toBe("off");
    first.unmount();
    const second = renderHook(() => useKeepAwakePref());
    expect(second.result.current[0]).toBe(false);
    act(() => second.result.current[1](true));
    expect(window.localStorage.getItem("prosanti-rider-keep-awake")).toBe("on");
  });
});
