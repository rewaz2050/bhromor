import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
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
vi.mock("@/lib/rider-push-client", () => ({
  readLocalPush: mocks.rider.local,
  fetchRiderPushStatus: mocks.rider.status,
  repairRiderPush: mocks.rider.repair,
  enableRiderPush: mocks.rider.enable,
  disableRiderPush: mocks.rider.disable,
  riderPushBlocker: () => null,
  riderRecoverySteps: () => [],
}));
vi.mock("@/lib/vendor-push-client", () => ({
  readVendorLocalPush: mocks.vendor.local,
  fetchVendorPushStatus: mocks.vendor.status,
  repairVendorPush: mocks.vendor.repair,
  enableVendorPush: mocks.vendor.enable,
  disableVendorPush: mocks.vendor.disable,
  vendorPushBlocker: () => null,
  vendorRecoverySteps: () => [],
}));
import { useRiderPush } from "@/lib/use-rider-push";
import { useVendorPush } from "@/lib/use-vendor-push";
import { RiderPushCard } from "../rider/rider-push-card";
import { VendorPushCard } from "../vendor/vendor-push-card";
const env = {
  https: true,
  notification: true,
  serviceWorker: true,
  pushManager: true,
  standalone: true,
  platform: "android",
  inApp: null,
  nativeApp: false,
};
const local = (on = false) => ({
  env,
  subscribed: on,
  permission: on ? "granted" : "default",
});
const server = {
  configured: true,
  tableReady: true,
  publicKey: "fixture-key",
  count: 1,
};
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(cleanup);
describe.each([
  {
    name: "rider",
    Card: RiderPushCard,
    hook: useRiderPush,
    api: mocks.rider,
    retry: "আবার চেষ্টা করুন",
    on: "নোটিফিকেশন চালু করুন",
    off: "বন্ধ করুন",
    probe: "নোটিফিকেশনের অবস্থা জানা যায়নি। আবার চেষ্টা করুন।",
    offError: "বন্ধ করা গেল না — আবার চেষ্টা করুন।",
  },
  {
    name: "vendor",
    Card: VendorPushCard,
    hook: useVendorPush,
    api: mocks.vendor,
    retry: "Try again",
    on: "Turn on notifications",
    off: "Turn off",
    probe: "Could not check notification status. Try again.",
    offError: "Could not turn them off — please try again.",
  },
])(
  "$name push recovery UI",
  ({ Card, hook, api, retry, on, off, probe, offError }) => {
    beforeEach(() => {
      Object.values(api).forEach((mock) => mock.mockReset());
      api.local.mockResolvedValue(local());
      api.status.mockResolvedValue(server);
      api.repair.mockResolvedValue({ ok: false });
      api.disable.mockResolvedValue(undefined);
    });
    it("shows a safe retryable alert for initial local probe failure, then recovers without a permission prompt", async () => {
      api.local.mockRejectedValueOnce(new Error("Private browser failure"));
      render(<Card enabled />);
      expect(await screen.findByRole("alert")).toHaveTextContent(probe);
      expect(
        screen.queryByText(/Private browser failure/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: on }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: retry }));
      expect(
        await screen.findByRole("button", { name: on }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(api.enable).not.toHaveBeenCalled();
      expect(api.local).toHaveBeenCalledTimes(2);
    });
    it("repeated probe failure remains retryable instead of disappearing forever", async () => {
      api.local.mockRejectedValue(new Error("Unavailable"));
      render(<Card enabled />);
      await screen.findByRole("alert");
      fireEvent.click(screen.getByRole("button", { name: retry }));
      expect(await screen.findByRole("alert")).toHaveTextContent(probe);
      expect(screen.getByRole("button", { name: retry })).toBeEnabled();
    });
    it("shows current turn-off failure while keeping the correct action available", async () => {
      api.local.mockResolvedValue(local(true));
      api.disable.mockRejectedValueOnce(new Error("Private disable detail"));
      render(<Card enabled />);
      fireEvent.click(await screen.findByRole("button", { name: off }));
      expect(await screen.findByRole("alert")).toHaveTextContent(offError);
      expect(screen.getByRole("button", { name: off })).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: retry }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: off }));
      expect(
        await screen.findByRole("button", { name: on }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(api.disable).toHaveBeenCalledTimes(2);
      expect(api.local).toHaveBeenCalledOnce();
    });
    it("does not show stale retry error after disable", async () => {
      api.local.mockRejectedValueOnce(new Error("Unavailable"));
      const { rerender, container } = render(<Card enabled />);
      await screen.findByRole("alert");
      rerender(<Card enabled={false} />);
      expect(container).toBeEmptyDOMElement();
    });
    it("retry pending through a lifetime change cannot publish its old error", async () => {
      const pending = deferred();
      api.local
        .mockRejectedValueOnce(new Error("Unavailable"))
        .mockReturnValueOnce(pending.promise);
      const { rerender } = render(<Card enabled />);
      await screen.findByRole("alert");
      fireEvent.click(screen.getByRole("button", { name: retry }));
      await waitFor(() => expect(api.local).toHaveBeenCalledTimes(2));
      rerender(<Card enabled={false} />);
      rerender(<Card enabled />);
      await screen.findByRole("button", { name: on });
      await act(async () => {
        pending.reject(new Error("Old retry failure"));
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    it("saved retry does not probe while initially disabled", async () => {
      const { result } = renderHook(() => hook(false));
      await act(async () => {
        expect(await result.current.retry()).toBe(false);
      });
      expect(api.local).not.toHaveBeenCalled();
    });
    it.each([false, true])(
      "saved retry cannot act across a disabled boundary (reenabled=%s)",
      async (reenabled) => {
        const { result, rerender } = renderHook(
          ({ enabled }) => hook(enabled),
          { initialProps: { enabled: true } },
        );
        await waitFor(() => expect(result.current.phase).toBe("off"));
        const saved = result.current.retry;
        rerender({ enabled: false });
        if (reenabled) {
          rerender({ enabled: true });
          await waitFor(() => expect(result.current.phase).toBe("off"));
        }
        api.local.mockClear();
        await act(async () => {
          expect(await saved()).toBe(false);
        });
        expect(api.local).not.toHaveBeenCalled();
      },
    );
    it("older retry rejection cannot replace the latest retry's successful state", async () => {
      api.local.mockRejectedValueOnce(new Error("Initial"));
      const { result } = renderHook(() => hook(true));
      await waitFor(() => expect(result.current.phase).toBe("error"));
      const old = deferred();
      api.local.mockReturnValueOnce(old.promise);
      let first!: Promise<boolean>;
      act(() => {
        first = result.current.retry();
      });
      await act(async () => {
        expect(await result.current.retry()).toBe(true);
      });
      await act(async () => {
        old.reject(new Error("Old"));
        expect(await first).toBe(false);
      });
      expect(result.current.phase).toBe("off");
      expect(result.current.error).toBeNull();
    });
    it("pending retry clears the stale alert without offering an enable action prematurely", async () => {
      const pending = deferred();
      api.local
        .mockRejectedValueOnce(new Error("Initial"))
        .mockReturnValueOnce(pending.promise);
      render(<Card enabled />);
      await screen.findByRole("alert");
      fireEvent.click(screen.getByRole("button", { name: retry }));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: on }),
      ).not.toBeInTheDocument();
      await act(async () => {
        pending.resolve(local());
      });
      expect(
        await screen.findByRole("button", { name: on }),
      ).toBeInTheDocument();
    });
    it("retry preserves granted-subscription repair without requesting permission again", async () => {
      api.local
        .mockRejectedValueOnce(new Error("Initial"))
        .mockResolvedValue(local(true));
      render(<Card enabled />);
      await screen.findByRole("alert");
      fireEvent.click(screen.getByRole("button", { name: retry }));
      await screen.findByRole("button", { name: off });
      expect(api.repair).toHaveBeenCalledOnce();
      expect(api.enable).not.toHaveBeenCalled();
    });
  },
);
