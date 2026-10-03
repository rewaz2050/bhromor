import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ reply: null as unknown, fail: false }));
vi.mock("@/lib/admin-api", () => ({
  apiGet: async () => {
    if (state.fail) throw new Error("nope");
    return state.reply;
  },
  apiErrorMessage: () => "Could not load.",
}));

import { RiderGpsCard } from "../rider-gps-card";

const flag = { id: "f1", at: "2026-10-03T06:00:00Z", distanceKm: 60.3, seconds: 60, speedKmh: 3615, from: { lat: 24.89, lng: 91.87 }, to: { lat: 25.3, lng: 92.3 } };

beforeEach(() => {
  state.fail = false;
});
afterEach(cleanup);

describe("<RiderGpsCard>", () => {
  it("shows the alerts with the numbers and map links", async () => {
    state.reply = { ready: true, flags: [flag], last30Days: 4 };
    render(<RiderGpsCard riderId="r1" />);
    await waitFor(() => expect(screen.getByTestId("gps-summary")).toHaveTextContent("4 in the last 30 days"));
    expect(screen.getByTestId("gps-flag")).toHaveTextContent("60.3 km in 60 s");
    expect(screen.getByRole("link", { name: "to" })).toHaveAttribute("href", "https://www.google.com/maps?q=25.3,92.3");
  });

  it("is a quiet tick when the rider is clean", async () => {
    state.reply = { ready: true, flags: [], last30Days: 0 };
    render(<RiderGpsCard riderId="r1" />);
    await waitFor(() => expect(screen.getByTestId("gps-clean")).toBeInTheDocument());
  });

  it("names the migration when it has not run, and shows an error alert on failure", async () => {
    state.reply = { ready: false, flags: [], last30Days: 0 };
    const { unmount } = render(<RiderGpsCard riderId="r1" />);
    await waitFor(() => expect(screen.getByTestId("gps-card")).toHaveTextContent("202610020019"));
    unmount();
    state.fail = true;
    render(<RiderGpsCard riderId="r1" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not load."));
  });
});
