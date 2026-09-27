/**
 * Admin → Reports → Funnel card (UX plan §0): prints the shop's own rates,
 * flags zero-result searches, says "run the migration" on 503, and stays
 * quiet when not signed in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_FUNNEL, type FunnelReport } from "@/lib/funnel-events";

const api = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<unknown>>(),
}));
vi.mock("@/lib/admin-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-api")>("@/lib/admin-api");
  return { ...actual, apiGet: (path: string) => api.get(path) };
});

import { AdminApiError } from "@/lib/admin-api";
import FunnelCard from "@/components/admin/funnel-card";

const report: FunnelReport = {
  ...EMPTY_FUNNEL,
  sessions: 200,
  pageViews: 640,
  bounceRate: 0.4,
  pagesPerSession: 3.2,
  pdpSessions: 100,
  atcSessions: 25,
  checkoutSessions: 10,
  purchaseSessions: 6,
  orders: 7,
  aov: 145000,
  customers: 7,
  repeatRate: 2 / 7,
  atcBySource: [
    { source: "card", count: 15 },
    { source: "pdp", count: 10 },
  ],
  topSearches: [
    { query: "saree", count: 9, zeroResults: false },
    { query: "iphone", count: 4, zeroResults: true },
  ],
  homeScroll: [
    { depth: 25, share: 0.75 },
    { depth: 100, share: 0.1 },
  ],
};

beforeEach(() => {
  api.get.mockReset();
});
afterEach(cleanup);

describe("FunnelCard", () => {
  it("is quiet unless signed in as staff", () => {
    render(<FunnelCard live={false} />);
    expect(screen.getByText(/sign in as staff/i)).toBeVisible();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("prints the funnel and flags zero-result searches; the toggle refetches for 28 days", async () => {
    api.get.mockResolvedValue(report);
    render(<FunnelCard live />);
    await waitFor(() => expect(screen.getByText("200")).toBeVisible());
    expect(api.get).toHaveBeenCalledWith("/api/admin/reports/funnel?days=7");
    const stat = (label: string) =>
      screen.getByText(label).parentElement?.querySelector("dd")?.textContent;
    expect(stat("Bounce")).toBe("40%");
    expect(stat("Pages / session")).toBe("3.2");
    expect(stat("Average order")).toBe("৳1,450");
    expect(stat("Repeat customers")).toBe("29%");
    const step = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? "";
    expect(step("Product page → add to bag")).toContain("25%");
    expect(step("Add to bag → checkout")).toContain("40%");
    expect(step("Checkout → order")).toContain("70%");
    expect(screen.getByText(/Card quick-add · 15/)).toBeVisible();
    expect(screen.getByTestId("zero-results")).toBeVisible();
    expect(screen.getByText(/iphone/)).toBeVisible();
    expect(screen.getByText("75%")).toBeVisible(); // home scroll 25% mark share
    fireEvent.click(screen.getByRole("button", { name: "28 days" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/admin/reports/funnel?days=28"));
  });

  it("says which migration to run when the report is not installed (503)", async () => {
    api.get.mockRejectedValue(new AdminApiError("Funnel report is not installed yet.", 503));
    render(<FunnelCard live />);
    await waitFor(() => expect(screen.getByTestId("funnel-missing")).toBeVisible());
    expect(screen.getByText(/202609260004_storefront_events\.sql/)).toBeVisible();
  });

  it("explains an empty window instead of showing zeros", async () => {
    api.get.mockResolvedValue({ ...EMPTY_FUNNEL });
    render(<FunnelCard live />);
    await waitFor(() => expect(screen.getByText(/no sessions recorded/i)).toBeVisible());
  });
});
