import { useState } from "react";
import FunnelCard from "@/components/vendor/funnel-card";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { emptyShopFunnel } from "../shop-funnel";
import { useVendorFunnel } from "../use-vendor";

vi.mock("../supabase-browser", () => ({ getSupabaseBrowser: () => null }));
const request = vi.fn();
const report = (days: 7 | 28, shopId = "shop-a") => ({ ...emptyShopFunnel(days), shopId, sessions: days * 10 });
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => { request.mockReset(); vi.stubGlobal("fetch", request); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("masks old-period data and marks a new period loading", async () => {
  const next = deferred<unknown>();
  request.mockResolvedValueOnce(response(report(7))).mockReturnValueOnce(next.promise);
  const { result, rerender } = renderHook(({ days }: { days: 7 | 28 }) => useVendorFunnel(true, days), { initialProps: { days: 7 } });
  await waitFor(() => expect(result.current.funnel?.days).toBe(7));
  rerender({ days: 28 });
  expect(result.current.funnel).toBeNull(); expect(result.current.loading).toBe(true);
  await act(async () => { next.resolve(response(report(28))); });
  expect(result.current.funnel?.days).toBe(28); expect(result.current.status).toBe(200);
});
it("clears data while disabled and during the next session's pending read", async () => {
  request.mockResolvedValueOnce(response(report(7))).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ enabled }) => useVendorFunnel(enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.funnel?.shopId).toBe("shop-a"));
  rerender({ enabled: false });
  expect(result.current.funnel).toBeNull(); expect(result.current.loading).toBe(false); expect(result.current.status).toBeNull();
  rerender({ enabled: true });
  expect(result.current.funnel).toBeNull(); expect(result.current.loading).toBe(true);
});
it("ignores a pending old-session report after a new session has loaded", async () => {
  const old = deferred<unknown>();
  request.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(report(7, "shop-b")));
  const { result, rerender } = renderHook(({ enabled }) => useVendorFunnel(enabled), { initialProps: { enabled: true } });
  rerender({ enabled: false }); rerender({ enabled: true });
  await waitFor(() => expect(result.current.funnel?.shopId).toBe("shop-b"));
  await act(async () => { old.resolve(response(report(7, "shop-a"))); });
  expect(result.current.funnel?.shopId).toBe("shop-b");
});
it("does not carry an old period's missing/error state into a pending new period", async () => {
  request.mockResolvedValueOnce(response({ missing: true, error: "Install report" }, 503)).mockReturnValueOnce(new Promise(() => {}));
  const { result, rerender } = renderHook(({ days }: { days: 7 | 28 }) => useVendorFunnel(true, days), { initialProps: { days: 7 } });
  await waitFor(() => expect(result.current.missing).toBe(true));
  rerender({ days: 28 });
  expect(result.current.missing).toBe(false); expect(result.current.error).toBeNull();
  expect(result.current.status).toBeNull(); expect(result.current.loading).toBe(true);
});
it.each([
  [503, { error: "Temporarily unavailable" }],
  [503, { error: "Temporarily unavailable", missing: "true" }],
  [403, { error: "Forbidden", missing: true }],
])("does not infer missing schema from status %i alone: %j", async (status, body) => {
  request.mockResolvedValueOnce(response(body, status));
  const { result } = renderHook(() => useVendorFunnel(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.missing).toBe(false); expect(result.current.status).toBe(status);
  expect(result.current.error).toBe(body.error);
});
it("preserves server-confirmed missing status and recovers after retry", async () => {
  request.mockResolvedValueOnce(response({ error: "Install report", missing: true }, 503));
  const { result } = renderHook(() => useVendorFunnel(true));
  await waitFor(() => expect(result.current.missing).toBe(true));
  expect(result.current.funnel).toBeNull(); expect(result.current.status).toBe(503);
  request.mockResolvedValueOnce(response(report(7)));
  await act(async () => { await result.current.refresh(); });
  await waitFor(() => expect(result.current.funnel?.days).toBe(7));
  expect(result.current.missing).toBe(false); expect(result.current.error).toBeNull();
});
it("ignores a previous period's late error", async () => {
  const old = deferred<unknown>();
  request.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(report(28)));
  const { result, rerender } = renderHook(({ days }: { days: 7 | 28 }) => useVendorFunnel(true, days), { initialProps: { days: 7 } });
  rerender({ days: 28 });
  await waitFor(() => expect(result.current.funnel?.days).toBe(28));
  await act(async () => { old.reject(new Error("Old request offline")); });
  expect(result.current.error).toBeNull(); expect(result.current.status).toBe(200);
});
it("settles offline failures and recovers without inventing zero visitors", async () => {
  request.mockRejectedValueOnce(new Error("Offline"));
  const { result } = renderHook(() => useVendorFunnel(true));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.funnel).toBeNull(); expect(result.current.missing).toBe(false);
  expect(result.current.error).toBe("Could not reach the server.");
  request.mockResolvedValueOnce(response(report(7)));
  await act(async () => { await result.current.refresh(); });
  await waitFor(() => expect(result.current.funnel?.sessions).toBe(70));
});
it("saved refresh callbacks cannot start reads while disabled", async () => {
  request.mockResolvedValueOnce(response(report(7)));
  const { result, rerender } = renderHook(({ enabled }) => useVendorFunnel(enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.funnel).not.toBeNull());
  const refresh = result.current.refresh;
  rerender({ enabled: false });
  await act(async () => { await refresh(); });
  expect(request).toHaveBeenCalledTimes(1); expect(result.current.loading).toBe(false);
});
it("the latest explicit refresh owns the report", async () => {
  const old = deferred<unknown>();
  request.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(report(7, "latest")));
  const { result } = renderHook(() => useVendorFunnel(true));
  await act(async () => { await result.current.refresh(); });
  await waitFor(() => expect(result.current.funnel?.shopId).toBe("latest"));
  await act(async () => { old.resolve(response(report(7, "old"))); });
  expect(result.current.funnel?.shopId).toBe("latest");
});


function FunnelProbe() {
  const [days, setDays] = useState<7 | 28>(7);
  const state = useVendorFunnel(true, days);
  return <FunnelCard funnel={state.funnel} days={days} loading={state.loading} missing={state.missing} error={state.error} onDays={setDays} onRetry={state.refresh} />;
}
it("rendered card hides old totals and keeps period controls usable while loading", async () => {
  const next = deferred<unknown>();
  request.mockResolvedValueOnce(response(report(7))).mockReturnValueOnce(next.promise);
  render(<FunnelProbe />);
  await screen.findByTestId("funnel-totals");
  fireEvent.click(screen.getByRole("button", { name: "28 days" }));
  expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  expect(screen.queryByTestId("funnel-totals")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "28 days" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => { next.resolve(response(report(28))); });
  expect(screen.getByTestId("funnel-totals")).toHaveTextContent("280");
});
it("rendered card shows generic 503 as retryable error, not migration guidance", async () => {
  request.mockResolvedValueOnce(response({ error: "Funnel temporarily offline" }, 503));
  render(<FunnelProbe />);
  await screen.findByText("Funnel temporarily offline");
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
  request.mockResolvedValueOnce(response(report(7)));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByTestId("funnel-totals");
  expect(screen.queryByText("Funnel temporarily offline")).not.toBeInTheDocument();
});
