import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FunnelCard from "../funnel-card";
import { EMPTY_FUNNEL } from "@/lib/funnel-events";

vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowser: () => null }));
const request = vi.fn();
const valid = {
  ...EMPTY_FUNNEL,
  sessions: 100,
  pageViews: 200,
  pagesPerSession: 2,
};
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">Render crashed</p>
    ) : (
      this.props.children
    );
  }
}
beforeEach(() => {
  localStorage.clear();
  request.mockReset();
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const reply = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

it.each([
  null,
  {},
  { error: "Proxy answered with HTTP 200" },
  { sessions: 25 },
  { ...valid, pagesPerSession: "2" },
  { ...valid, topSearches: null },
  { ...valid, homeScroll: [null] },
  { ...valid, atcBySource: [{ source: "card", count: "3" }] },
  { ...valid, topSearches: [{ query: {}, count: 1, zeroResults: false }] },
  { ...valid, bounceRate: Infinity },
  { ...valid, days: 28 },
])(
  "invalid or wrong-period admin payload is a retryable error, not empty analytics: %j",
  async (body) => {
    request.mockResolvedValueOnce(reply(body));
    render(
      <Boundary>
        <FunnelCard live />
      </Boundary>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The funnel response could not be validated. Try again.",
    );
    expect(screen.queryByText(/No sessions recorded/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  },
);
it("retries an invalid admin response and keeps verified calculations unchanged", async () => {
  request.mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply(valid));
  render(
    <Boundary>
      <FunnelCard live />
    </Boundary>,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("100")).toBeInTheDocument();
  expect(screen.getByText("Pages / session").parentElement).toHaveTextContent(
    "2.0",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("a complete zero-session report is still a valid empty window", async () => {
  request.mockResolvedValueOnce(reply(EMPTY_FUNNEL));
  render(<FunnelCard live />);
  expect(
    await screen.findByText(/No sessions recorded in the last 7 days/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
