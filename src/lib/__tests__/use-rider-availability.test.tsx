import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRiderAvailability } from "../use-rider-availability";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function setup() {
  const options = {
    setOnline: vi
      .fn<(online: boolean) => Promise<boolean>>()
      .mockResolvedValue(true),
    refresh: vi.fn(async () => {}),
    sendLocation: vi
      .fn<(lat: number, lng: number) => Promise<boolean>>()
      .mockResolvedValue(true),
    error: null,
    onError: vi.fn(),
  };
  const get = vi.fn();
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: get } });
  const hook = renderHook(
    ({ key, online, cash }) =>
      useRiderAvailability({
        ...options,
        ownerKey: key,
        online,
        cashInHand: cash,
      }),
    { initialProps: { key: "a" as string | null, online: false, cash: 0 } },
  );
  return { ...hook, options, get };
}
const position = {
  coords: { latitude: 23.7, longitude: 90.4 },
} as GeolocationPosition;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("lock covers the session refresh; old refresh cannot unlock a new owner's pending write", async () => {
  const { result, rerender, options } = setup();
  const read = deferred<void>(),
    write = deferred<boolean>();
  options.refresh.mockReturnValueOnce(read.promise);
  await act(async () => {
    void result.current.toggle();
  });
  expect(result.current.pending).toBe(true);
  expect(result.current.online).toBe(true);
  rerender({ key: "b", online: false, cash: 0 });
  options.setOnline.mockReturnValueOnce(write.promise);
  act(() => {
    void result.current.toggle();
  });
  await act(async () => {
    read.resolve();
  });
  expect(result.current.pending).toBe(true);
  expect(result.current.online).toBe(false);
  await act(async () => {
    write.resolve(false);
  });
  expect(result.current.pending).toBe(false);
});
it("unmount during a pending write prevents later refresh and errors", async () => {
  const { result, unmount, options } = setup();
  const write = deferred<boolean>();
  options.setOnline.mockReturnValueOnce(write.promise);
  act(() => {
    void result.current.toggle();
  });
  unmount();
  await act(async () => {
    write.resolve(true);
  });
  expect(options.refresh).not.toHaveBeenCalled();
  expect(options.onError).not.toHaveBeenCalled();
});
it("unmount during session refresh prevents a new one-shot GPS request", async () => {
  const { result, unmount, options, get } = setup();
  const read = deferred<void>();
  options.refresh.mockReturnValueOnce(read.promise);
  await act(async () => {
    void result.current.toggle();
  });
  unmount();
  await act(async () => {
    read.resolve();
  });
  expect(get).not.toHaveBeenCalled();
});
it("disabled and stale captured toggle callbacks perform no write", async () => {
  const { result, rerender, options } = setup();
  const old = result.current.toggle;
  rerender({ key: null, online: false, cash: 0 });
  await act(async () => {
    await old();
    await result.current.toggle();
  });
  expect(options.setOnline).not.toHaveBeenCalled();
});
it("A → B → A never revives the old pending availability completion", async () => {
  const { result, rerender, options } = setup();
  const write = deferred<boolean>();
  options.setOnline.mockReturnValueOnce(write.promise);
  act(() => {
    void result.current.toggle();
  });
  rerender({ key: "b", online: false, cash: 0 });
  rerender({ key: "a", online: false, cash: 0 });
  await act(async () => {
    write.resolve(true);
  });
  expect(options.refresh).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);
  expect(result.current.online).toBe(false);
});
it("observed server offline truth permanently invalidates the old fix even if online returns", async () => {
  const { result, rerender, get, options } = setup();
  await act(async () => {
    await result.current.toggle();
  });
  rerender({ key: "a", online: true, cash: 0 });
  rerender({ key: "a", online: false, cash: 0 });
  rerender({ key: "a", online: true, cash: 0 });
  await act(async () => {
    get.mock.calls[0][0](position);
  });
  expect(options.sendLocation).not.toHaveBeenCalled();
});
it("best-effort GPS permission/synchronous failures do not mark availability as failed", async () => {
  const { result, get, options } = setup();
  get.mockImplementationOnce(() => {
    throw new Error("GPS unavailable");
  });
  await act(async () => {
    await result.current.toggle();
  });
  expect(result.current.pending).toBe(false);
  expect(options.onError).toHaveBeenCalledExactlyOnceWith(null);
});
it("cash confirmation preserves explicit offline consent and amount policy", async () => {
  const { result, rerender, options, get } = setup();
  rerender({ key: "a", online: true, cash: 50000 });
  await act(async () => {
    await result.current.toggle();
  });
  expect(result.current.confirmCash).toBe(true);
  expect(options.setOnline).not.toHaveBeenCalled();
  act(() => {
    result.current.dismissCash();
  });
  expect(result.current.confirmCash).toBe(false);
  await act(async () => {
    await result.current.toggle(true);
  });
  expect(options.setOnline).toHaveBeenCalledExactlyOnceWith(false);
  expect(get).not.toHaveBeenCalled();
  expect(result.current.confirmCash).toBe(false);
});
it("current GPS callback is single-use and rejected location sends stay silent", async () => {
  const { result, rerender, get, options } = setup();
  options.sendLocation.mockRejectedValueOnce(new Error("Transport detail"));
  await act(async () => {
    await result.current.toggle();
  });
  rerender({ key: "a", online: true, cash: 0 });
  await act(async () => {
    get.mock.calls[0][0](position);
    get.mock.calls[0][0](position);
  });
  expect(options.sendLocation).toHaveBeenCalledExactlyOnceWith(23.7, 90.4);
  expect(options.onError).toHaveBeenCalledExactlyOnceWith(null);
});
it("server still offline after refresh does not accept a one-shot fix", async () => {
  const { result, get, options } = setup();
  await act(async () => {
    await result.current.toggle();
  });
  await act(async () => {
    get.mock.calls[0][0](position);
  });
  expect(result.current.online).toBe(false);
  expect(options.sendLocation).not.toHaveBeenCalled();
});
