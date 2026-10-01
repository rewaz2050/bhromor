import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  settlements: [] as unknown[],
  signOut: vi.fn(async () => {}),
}));

vi.mock("@/lib/use-rider", () => ({
  useRiderSession: () => ({
    status: "authed",
    rider: { id: "r1", name: "রফিক", availability: null },
    email: "rafiq@example.com",
    refresh: vi.fn(async () => {}),
    setAvailability: vi.fn(async () => null),
    signOut: state.signOut,
  }),
  useRiderJobs: () => ({ settlements: state.settlements }),
}));
vi.mock("@/components/rider/rider-profile", () => ({ RiderProfile: () => <div data-testid="profile-form" /> }));
vi.mock("@/components/rider/rider-shift-card", () => ({ RiderShiftCard: () => <div data-testid="shift-card" /> }));

import RiderProfilePage from "../profile/page";

afterEach(cleanup);

describe("<RiderProfilePage>", () => {
  it("holds the profile form and the shift card, which left the home screen", () => {
    render(<RiderProfilePage />);
    expect(screen.getByTestId("profile-form")).toBeTruthy();
    expect(screen.getByTestId("shift-card")).toBeTruthy();
    expect(screen.getByText(/rafiq@example.com/)).toBeTruthy();
  });

  it("lists cash handed in, with the part settled from the wallet", () => {
    state.settlements = [{ id: "s1", amount: 300000, nettedAmount: 120000, method: "cash", reference: "", at: Date.parse("2026-10-01T10:00:00Z") }];
    render(<RiderProfilePage />);
    const text = screen.getByLabelText("Recent settlements").textContent ?? "";
    expect(text).toContain("৳3,000");
    expect(text).toContain("৳1,200");
    expect(text).toContain("৳1,800");
  });

  it("signs out from here", () => {
    state.settlements = [];
    render(<RiderProfilePage />);
    fireEvent.click(screen.getByRole("button", { name: /সাইন আউট/ }));
    expect(state.signOut).toHaveBeenCalled();
  });
});
