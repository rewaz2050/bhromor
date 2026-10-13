/**
 * The two cards added to the rider home screen (2026-10-13).
 *
 * The daily bonus target lived only on /rider/earnings and the rating was a
 * 10px footnote, so the screen a rider works from carried nothing to aim at
 * and no honest reading of where they stand. What has to hold:
 *   · the rating says "…" until the figure lands and says plainly that a new
 *     rider is unrated — never a fabricated 4.0;
 *   · the bonus card disappears entirely when staff have switched the daily
 *     bonus off, so a rider is never shown a promise the shop is not making.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import IncentiveProgress from "../incentive-progress";
import RatingTile from "../rating-tile";
import type { RiderStatsView } from "@/lib/use-rider";
import type { RiderIncentiveView } from "@/lib/rider-incentives";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const stats = (over: Partial<RiderStatsView> = {}): RiderStatsView => ({
  totalDeliveries: 120,
  weekDeliveries: 14,
  ratingAvg: 4.8,
  ratingCount: 96,
  ...over,
});

const view = (over: Partial<RiderIncentiveView> = {}): RiderIncentiveView => ({
  settings: {
    dailyTarget: 5,
    dailyBonus: 5000,
    referralBonus: 0,
    referralAfter: 0,
    weeklyTarget: 0,
    weeklyBonus: 0,
    weeklyTarget2: 0,
    weeklyBonus2: 0,
  },
  today: { done: 3, target: 5, left: 2, reached: false, percent: 60 },
  todayPaid: false,
  week: null,
  referral: { code: "", after: 0, bonus: 0, items: [], totalEarned: 0 },
  totalEarned: 0,
  ...over,
});

const originalFetch = globalThis.fetch;
let incentives: unknown;

beforeEach(() => {
  incentives = { ready: true, view: view() };
  globalThis.fetch = vi.fn(async () => jsonResponse(incentives)) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  vi.restoreAllMocks();
});

describe("RatingTile", () => {
  it("says … until the figure arrives rather than inventing one", () => {
    render(<RatingTile stats={null} />);
    expect(screen.getByText("…")).toBeTruthy();
  });

  it("tells a new rider plainly that they are not rated yet", () => {
    render(<RatingTile stats={stats({ ratingAvg: 0, ratingCount: 0 })} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/এখনো রেটিং পাননি/)).toBeTruthy();
  });

  it("makes the rating big enough to read at a glance", () => {
    render(<RatingTile stats={stats()} />);
    expect(screen.getByText("4.8")).toBeTruthy();
    expect(screen.getByText(/96 জন রেটিং দিয়েছেন/)).toBeTruthy();
  });
});

describe("IncentiveProgress", () => {
  it("shows how far today's target is and what is left", async () => {
    render(<IncentiveProgress enabled />);
    await waitFor(() => expect(screen.getByTestId("incentive-progress")).toBeTruthy());
    expect(screen.getByText(/3\/5 ডেলিভারি — আর 2টি বাকি/)).toBeTruthy();
  });

  it("renders nothing when staff have the daily bonus switched off", async () => {
    incentives = { ready: true, view: view({ today: null, settings: { ...view().settings, dailyTarget: 0 } }) };
    render(<IncentiveProgress enabled />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("incentive-progress")).toBeNull());
  });

  it("does not fetch at all while the rider is offline", () => {
    render(<IncentiveProgress enabled={false} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("incentive-progress")).toBeNull();
  });
});
