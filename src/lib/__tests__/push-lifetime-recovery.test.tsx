import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const make = () => ({
    local: vi.fn(),
    status: vi.fn(),
    repair: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
  });
  return { rider: make(), vendor: make() };
});
vi.mock("../rider-push-client", () => ({
  readLocalPush: mocks.rider.local,
  fetchRiderPushStatus: mocks.rider.status,
  repairRiderPush: mocks.rider.repair,
  enableRiderPush: mocks.rider.enable,
  disableRiderPush: mocks.rider.disable,
  riderPushBlocker: () => null,
  riderRecoverySteps: () => [],
}));
vi.mock("../vendor-push-client", () => ({
  readVendorLocalPush: mocks.vendor.local,
  fetchVendorPushStatus: mocks.vendor.status,
  repairVendorPush: mocks.vendor.repair,
  enableVendorPush: mocks.vendor.enable,
  disableVendorPush: mocks.vendor.disable,
  vendorPushBlocker: () => null,
  vendorRecoverySteps: () => [],
}));
import { useRiderPush } from "../use-rider-push";
import { useVendorPush } from "../use-vendor-push";
const env = {
  https: true,
  notification: true,
  pushManager: true,
  serviceWorker: true,
  standalone: true,
  platform: "android",
  inApp: null,
  nativeApp: false,
};
const local = (subscribed = false) => ({
  env,
  permission: subscribed ? "granted" : "default",
  subscribed,
});
const server = {
  configured: true,
  tableReady: true,
  publicKey: "fixture-key",
  count: 1,
};
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
afterEach(cleanup);
describe.each([
  { name: "rider", hook: useRiderPush, api: mocks.rider },
  { name: "vendor", hook: useVendorPush, api: mocks.vendor },
])("$name push lifecycle", ({ hook, api }) => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.local.mockResolvedValue(local());
    api.status.mockResolvedValue(server);
    api.repair.mockResolvedValue({ ok: false });
    api.enable.mockResolvedValue({ ok: false, reason: "dismissed" });
    api.disable.mockResolvedValue(undefined);
  });
  const mount = async () => {
    const result = renderHook(({ enabled }) => hook(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.result.current.phase).toBe("off"));
    return result;
  };
  it("does not probe or mutate while initially disabled", async () => {
    const { result } = renderHook(() => hook(false));
    await act(async () => {
      expect(await result.current.enable()).toBe(false);
      await result.current.disable();
    });
    expect(api.local).not.toHaveBeenCalled();
    expect(api.enable).not.toHaveBeenCalled();
    expect(api.disable).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
  it("clears subscribed phase and error/busy when disabled", async () => {
    api.local.mockResolvedValue(local(true));
    api.repair.mockResolvedValue({ ok: true });
    const { result, rerender } = renderHook(({ enabled }) => hook(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.phase).toBe("on"));
    rerender({ enabled: false });
    expect(result.current.phase).toBe("loading");
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });
  it("re-probes after re-enable instead of retaining the one-time boot snapshot", async () => {
    const { result, rerender } = await mount();
    rerender({ enabled: false });
    api.local.mockResolvedValue(local(true));
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("on"));
    expect(api.local).toHaveBeenCalledTimes(2);
  });
  it.each(["enable", "disable"] as const)(
    "saved %s does not act after disable/re-enable",
    async (action) => {
      const { result, rerender } = await mount();
      const saved = result.current[action];
      rerender({ enabled: false });
      rerender({ enabled: true });
      await waitFor(() => expect(result.current.phase).toBe("off"));
      await act(async () => {
        await saved();
      });
      expect(api[action]).not.toHaveBeenCalled();
    },
  );
  it("late local probe does not fetch server status after disable", async () => {
    const pending = deferred();
    api.local.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ enabled }) => hook(enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    await act(async () => {
      pending.resolve(local(true));
    });
    expect(api.status).not.toHaveBeenCalled();
    expect(api.repair).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("loading");
  });
  it("late server status cannot start repair for a later lifetime", async () => {
    const pending = deferred();
    api.local.mockResolvedValueOnce(local(true));
    api.status.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ enabled }) => hook(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(api.status).toHaveBeenCalledOnce());
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("off"));
    await act(async () => {
      pending.resolve(server);
    });
    expect(api.repair).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("off");
  });
  it("old successful enable does not refresh a later lifetime", async () => {
    const pending = deferred();
    api.enable.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await mount();
    let action!: Promise<boolean>;
    act(() => {
      action = result.current.enable();
    });
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("off"));
    api.local.mockClear();
    await act(async () => {
      pending.resolve({ ok: true });
      expect(await action).toBe(false);
    });
    expect(api.local).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });
  it("old failed enable cannot set an error in a later lifetime", async () => {
    const pending = deferred();
    api.enable.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await mount();
    let action!: Promise<boolean>;
    act(() => {
      action = result.current.enable();
    });
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("off"));
    await act(async () => {
      pending.resolve({
        ok: false,
        reason: "save-failed",
        message: "Old account error",
      });
      await action;
    });
    expect(result.current.error).toBeNull();
  });
  it("old disable cannot switch a later subscribed lifetime off", async () => {
    const pending = deferred();
    api.disable.mockReturnValueOnce(pending.promise);
    const { result, rerender } = await mount();
    let action!: Promise<void>;
    act(() => {
      action = result.current.disable();
    });
    rerender({ enabled: false });
    api.local.mockResolvedValue(local(true));
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("on"));
    await act(async () => {
      pending.resolve(undefined);
      await action;
    });
    expect(result.current.phase).toBe("on");
  });
  it("old completion does not clear a newer action's busy state", async () => {
    const old = deferred(),
      current = deferred();
    api.enable
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result } = await mount();
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = result.current.enable();
    });
    act(() => {
      second = result.current.enable();
    });
    await act(async () => {
      old.resolve({ ok: false, reason: "dismissed" });
      await first;
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => {
      current.resolve({
        ok: false,
        reason: "save-failed",
        message: "Current error",
      });
      await second;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe("Current error");
  });
  it("late automatic repair cannot revive notifications after explicit disable", async () => {
    const pending = deferred();
    api.local.mockResolvedValue(local(true));
    api.repair.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => hook(true));
    await waitFor(() => expect(api.repair).toHaveBeenCalledOnce());
    await act(async () => {
      await result.current.disable();
    });
    expect(result.current.phase).toBe("off");
    await act(async () => {
      pending.resolve({ ok: true });
    });
    expect(result.current.phase).toBe("off");
  });
  it("unmounted local probe cannot continue to server/repair", async () => {
    const pending = deferred();
    api.local.mockReturnValueOnce(pending.promise);
    const { unmount } = renderHook(() => hook(true));
    unmount();
    await act(async () => {
      pending.resolve(local(true));
    });
    expect(api.status).not.toHaveBeenCalled();
    expect(api.repair).not.toHaveBeenCalled();
  });
  it("unexpected enable rejection releases busy and returns a safe failure", async () => {
    const { result } = await mount();
    api.enable.mockRejectedValueOnce(new Error("Internal browser detail"));
    await act(async () => {
      expect(await result.current.enable()).toBe(false);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toContain("Internal browser detail");
  });
  it("keeps current success/disable behavior and permission-denied phase", async () => {
    const { result } = await mount();
    api.enable.mockResolvedValueOnce({ ok: true });
    api.local.mockResolvedValue(local(true));
    await act(async () => {
      expect(await result.current.enable()).toBe(true);
    });
    expect(result.current.phase).toBe("on");
    await act(async () => {
      await result.current.disable();
    });
    expect(result.current.phase).toBe("off");
    api.enable.mockResolvedValueOnce({ ok: false, reason: "denied" });
    await act(async () => {
      expect(await result.current.enable()).toBe(false);
    });
    expect(result.current.phase).toBe("denied");
  });
  it.each(["unconfigured", "missing-table"])(
    "preserves current off-server phase: %s",
    async (reason) => {
      api.status.mockResolvedValue({
        ...server,
        configured: reason !== "unconfigured",
        tableReady: reason !== "missing-table",
      });
      const { result } = renderHook(() => hook(true));
      await waitFor(() => expect(result.current.phase).toBe("off-server"));
      expect(api.repair).not.toHaveBeenCalled();
    },
  );
  it("keeps the existing unknown-server fallback on status read failure", async () => {
    api.status.mockRejectedValueOnce(new Error("Status unavailable"));
    const { result } = await mount();
    expect(result.current.phase).toBe("off");
    expect(api.repair).not.toHaveBeenCalled();
  });
  it("current disable rejection keeps its safe message and releases busy", async () => {
    const { result } = await mount();
    api.disable.mockRejectedValueOnce(new Error("Private browser detail"));
    await act(async () => {
      await result.current.disable();
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toContain("Private browser detail");
  });
  it("old disable rejection cannot publish an error in the next lifetime", async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise((_yes, no) => {
      reject = no;
    });
    api.disable.mockReturnValueOnce(pending);
    const { result, rerender } = await mount();
    let action!: Promise<void>;
    act(() => {
      action = result.current.disable();
    });
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.phase).toBe("off"));
    await act(async () => {
      reject(new Error("Old disable failed"));
      await action;
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });
  it("rechecks ownership during the successful enable's follow-up probe", async () => {
    const { result } = await mount();
    const pending = deferred();
    api.enable.mockResolvedValueOnce({ ok: true });
    api.local.mockReturnValueOnce(pending.promise);
    let enabled!: Promise<boolean>;
    act(() => {
      enabled = result.current.enable();
    });
    await waitFor(() => expect(api.local).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.disable();
    });
    api.status.mockClear();
    await act(async () => {
      pending.resolve(local(true));
      expect(await enabled).toBe(false);
    });
    expect(result.current.phase).toBe("off");
    expect(result.current.busy).toBe(false);
    expect(api.status).not.toHaveBeenCalled();
  });
});
