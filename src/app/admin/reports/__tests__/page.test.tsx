/**
 * P2 #4 (audit R5) — the best-sellers section is staff-only data: a
 * signed-out read-only view of /admin/reports must stay quiet (no fetch,
 * no red error, no eternal "Loading…"), and staff must get the list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ live: false }));

vi.mock("@/lib/use-staff-live", () => ({
  useStaffLive: () => ({ live: state.live, checked: true }),
}));

vi.mock("@/lib/use-orders", () => ({
  useOrders: () => ({ orders: [] }),
}));

const apiGetMock = vi.fn();
vi.mock("@/lib/admin-api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiErrorMessage: (e: unknown) => String(e),
  apiSend: vi.fn(),
}));

import AdminReportsPage from "../page";

beforeEach(() => {
  state.live = false;
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue({ bestSellers: [] });
});

afterEach(() => {
  cleanup();
});

describe("Reports — best sellers section (R5)", () => {
  it("stays quiet for a signed-out view: no fetch, no error, no spinner", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByText(/Sign in as staff to load the all-time/)).toBeVisible();
    // UX plan §0 — the funnel card follows the same rule.
    expect(screen.getByText(/Sign in as staff to load the funnel/)).toBeVisible();
    expect(apiGetMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("loads the list for staff and shows the honest empty state", async () => {
    state.live = true;
    render(<AdminReportsPage />);
    expect(
      await screen.findByText(
        "No eligible sales yet — the storefront keeps showing no badges and no ranking until the first order lands.",
      ),
    ).toBeVisible();
    expect(apiGetMock).toHaveBeenCalledWith("/api/admin/reports/best-sellers");
    expect(apiGetMock).toHaveBeenCalledWith("/api/admin/reports/funnel?days=7");
    expect(await screen.findByText(/No sessions recorded in the last 7 days/)).toBeVisible();
  });
});
