import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeScorecards, rankScorecards } from "@/lib/rider-quality";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown>, setPolicy: vi.fn() }));
vi.mock("@/lib/use-rider-scorecards", () => ({ useRiderScorecards: () => state.hook }));

import RiderScorecardsPage from "../riders/scorecard/page";

const NOW = Date.now();
const riders = rankScorecards(
  normalizeScorecards([
    { id: "good", name: "Good Rider", delivered: 25, offered: 25, ratingAvg: 4.9, ratingCount: 12 },
    { id: "bad", name: "Bad Rider", delivered: 3, failed: 7, offered: 10, declined: 5, ratingAvg: 3, ratingCount: 4 },
    { id: "new", name: "Newbie" },
  ]),
  500000,
  NOW,
);

beforeEach(() => {
  state.setPolicy.mockReset().mockResolvedValue(true);
  state.hook = { live: true, checked: true, riders, ready: true, autoSuspend: false, loaded: true, error: null, refresh: vi.fn(), setPolicy: state.setPolicy };
});

describe("/admin/riders/scorecard", () => {
  it("lists riders worst first with grade and the reason behind each flag", () => {
    render(<RiderScorecardsPage />);
    const rows = screen.getAllByTestId("scorecard-row");
    expect(rows.map((r) => r.getAttribute("data-grade"))).toEqual(["D", "A", "new"]);
    expect(within(rows[0]).getByText(/70% deliveries failed/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Meets auto-suspend rule/)).toBeInTheDocument();
    expect(screen.getByTestId("at-risk")).toHaveTextContent("স্বয়ংক্রিয় বন্ধ");
  });

  it("filters to flagged riders only", () => {
    render(<RiderScorecardsPage />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getAllByTestId("scorecard-row")).toHaveLength(1);
  });

  it("asks for confirmation before switching auto-suspend ON, and does nothing if declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RiderScorecardsPage />);
    fireEvent.click(screen.getByTestId("auto-suspend-toggle"));
    expect(confirm).toHaveBeenCalled();
    expect(state.setPolicy).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("auto-suspend-toggle"));
    await waitFor(() => expect(state.setPolicy).toHaveBeenCalledWith(true));
    confirm.mockRestore();
  });

  it("turning it OFF needs no confirmation", async () => {
    state.hook.autoSuspend = true;
    const confirm = vi.spyOn(window, "confirm");
    render(<RiderScorecardsPage />);
    expect(screen.getByTestId("auto-suspend-toggle")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("auto-suspend-toggle"));
    await waitFor(() => expect(state.setPolicy).toHaveBeenCalledWith(false));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("explains the migration when scorecards are not set up", () => {
    state.hook.ready = false;
    state.hook.riders = [];
    render(<RiderScorecardsPage />);
    expect(screen.getByTestId("scorecards-missing")).toHaveTextContent("202610020006");
    expect(screen.queryByTestId("auto-suspend-card")).toBeNull();
  });
});
