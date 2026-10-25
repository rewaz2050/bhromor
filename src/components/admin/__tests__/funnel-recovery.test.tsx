import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FunnelCard from "../funnel-card";
import { EMPTY_FUNNEL } from "@/lib/funnel-events";

vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowser: () => null }));
const fetchMock = vi.fn();
const report = (sessions: number) => ({ ...EMPTY_FUNNEL, sessions, pageViews: sessions, pagesPerSession: 1 });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("does not restore the old enabled lifetime's report while a fresh read is pending", async () => {
  const next = deferred<Response>();
  fetchMock.mockResolvedValueOnce(response(report(211))).mockReturnValueOnce(next.promise);
  const { rerender } = render(<FunnelCard live />);
  await screen.findByText("211");
  rerender(<FunnelCard live={false} />);
  expect(screen.queryByText("211")).not.toBeInTheDocument();
  rerender(<FunnelCard live />);
  expect(screen.queryByText("211")).not.toBeInTheDocument();
  expect(screen.getByText("Loading…")).toBeInTheDocument();
  await act(async () => { next.resolve(response(report(311))); });
  await screen.findByText("311");
});
it("does not retain old missing-schema guidance after disable/re-enable", async () => {
  fetchMock.mockResolvedValueOnce(response({ missing: true, error: "Install funnel" }, 503)).mockReturnValueOnce(new Promise(() => {}));
  const { rerender } = render(<FunnelCard live />);
  await screen.findByTestId("funnel-missing");
  rerender(<FunnelCard live={false} />); rerender(<FunnelCard live />);
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
  expect(screen.getByText("Loading…")).toBeInTheDocument();
});
it.each([undefined, false, "true"])("a generic 503 with missing=%j is an error, not migration evidence", async missing => {
  fetchMock.mockResolvedValueOnce(response({ error: "Analytics unavailable", missing }, 503));
  render(<FunnelCard live />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Analytics unavailable");
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
it("confirms missing schema only from the server signal and can recheck after installation", async () => {
  fetchMock.mockResolvedValueOnce(response({ missing: true, error: "Install funnel" }, 503));
  render(<FunnelCard live />);
  await screen.findByTestId("funnel-missing");
  fetchMock.mockResolvedValueOnce(response(report(411)));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("411");
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
});
it("recovers a transient network failure with an explicit retry", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Offline"));
  render(<FunnelCard live />);
  await screen.findByText("Could not reach the server.");
  fetchMock.mockResolvedValueOnce(response(report(511)));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("511");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("ignores an earlier session's late response after a new report is shown", async () => {
  const old = deferred<Response>();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(report(611)));
  const { rerender } = render(<FunnelCard live />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  rerender(<FunnelCard live={false} />); rerender(<FunnelCard live />);
  await screen.findByText("611");
  await act(async () => { old.resolve(response(report(711))); });
  expect(screen.getByText("611")).toBeInTheDocument(); expect(screen.queryByText("711")).not.toBeInTheDocument();
});
it("keeps period buttons mounted and hides previous-window totals while fetching", async () => {
  const next = deferred<Response>();
  fetchMock.mockResolvedValueOnce(response(report(811))).mockReturnValueOnce(next.promise);
  render(<FunnelCard live />);
  await screen.findByText("811");
  fireEvent.click(screen.getByRole("button", { name: "28 days" }));
  expect(screen.queryByText("811")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "28 days" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => { next.resolve(response({ ...report(911), days: 28 })); });
  await screen.findByText("911");
});

it("does not treat forbidden responses as missing schema even with missing:true", async () => {
  fetchMock.mockResolvedValueOnce(response({ missing: true, error: "Forbidden" }, 403));
  render(<FunnelCard live />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
});
it("ignores a previous window's late missing-schema response", async () => {
  const old = deferred<Response>();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ ...report(1011), days: 28 }));
  render(<FunnelCard live />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "28 days" }));
  await screen.findByText("1,011");
  await act(async () => { old.resolve(response({ missing: true, error: "Old missing report" }, 503)); });
  expect(screen.getByText("1,011")).toBeInTheDocument();
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
});
it("root StrictMode cleanup cannot restore a discarded read", async () => {
  const old = deferred<Response>();
  fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(report(1211)));
  render(<FunnelCard live />, { reactStrictMode: true });
  await screen.findByText("1,211");
  await act(async () => { old.resolve(response(report(1311))); });
  expect(screen.getByText("1,211")).toBeInTheDocument();
  expect(screen.queryByText("1,311")).not.toBeInTheDocument();
});
