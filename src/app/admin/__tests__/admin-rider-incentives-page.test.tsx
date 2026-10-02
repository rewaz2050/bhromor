import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-rider-incentive-settings", () => ({ useRiderIncentiveSettings: () => state.hook }));

import IncentivesPage from "../riders/incentives/page";

const base = (over: Record<string, unknown> = {}) => ({
  live: true, checked: true, loaded: true, error: null,
  settings: { dailyTarget: 0, dailyBonus: 0, referralBonus: 0, referralAfter: 10 },
  save: vi.fn(async () => true), clearError: vi.fn(), ...over,
});

afterEach(cleanup);

describe("/admin/riders/incentives", () => {
  it("starts switched off and says so", () => {
    state.hook = base();
    render(<IncentivesPage />);
    expect(screen.getByTestId("incentives-state")).toHaveTextContent("সব বন্ধ");
    expect((screen.getByLabelText(/Deliveries in one day/) as HTMLInputElement).value).toBe("0");
  });

  it("shows stored amounts in taka and saves edits as taka", async () => {
    const save = vi.fn(async () => true);
    state.hook = base({ save, settings: { dailyTarget: 8, dailyBonus: 5000, referralBonus: 20000, referralAfter: 10 } });
    render(<IncentivesPage />);
    expect((screen.getByLabelText(/^Bonus/) as HTMLInputElement).value).toBe("50");
    expect((screen.getByLabelText(/Referral bonus/) as HTMLInputElement).value).toBe("200");
    fireEvent.change(screen.getByLabelText(/Deliveries in one day/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/^Bonus/), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ dailyTarget: "10", dailyBonusTaka: "75", referralBonusTaka: "200", referralAfter: "10" }),
    );
    expect(await screen.findByTestId("incentives-saved")).toBeInTheDocument();
  });

  it("a refused save shows the server message and no success banner", async () => {
    state.hook = base({ save: vi.fn(async () => false), error: "Set both the daily target and its bonus, or leave both at 0." });
    render(<IncentivesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Set both");
    expect(screen.queryByTestId("incentives-saved")).toBeNull();
  });

  it("asks for sign-in when not staff and renders no form", () => {
    state.hook = base({ live: false, checked: true });
    render(<IncentivesPage />);
    expect(screen.getByText(/sign in/)).toBeInTheDocument();
    expect(screen.queryByTestId("incentives-form")).toBeNull();
  });
});
