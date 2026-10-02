import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-rider-order-bonus", () => ({ useRiderOrderBonus: () => state.hook }));

import OrderBonusCard from "../order-bonus-card";

const base = (over: Record<string, unknown> = {}) => ({
  live: true, checked: true, loaded: true, error: null,
  settings: { peakBonus: 0, peakStartHour: 18, peakEndHour: 22, rainBonus: 0, streakWeeks: 0, streakBonus: 0 },
  save: vi.fn(async () => true), clearError: vi.fn(), ...over,
});

afterEach(cleanup);

describe("OrderBonusCard", () => {
  it("renders nothing without a staff session", () => {
    state.hook = base({ live: false });
    const { container } = render(<OrderBonusCard />);
    expect(container.firstChild).toBeNull();
  });

  it("starts switched off and shows stored amounts in taka", () => {
    state.hook = base();
    const { rerender } = render(<OrderBonusCard />);
    expect(screen.getByTestId("order-bonus-state")).toHaveTextContent("সব বন্ধ");
    state.hook = base({ settings: { peakBonus: 3000, peakStartHour: 22, peakEndHour: 2, rainBonus: 2000, streakWeeks: 4, streakBonus: 100000 } });
    rerender(<OrderBonusCard />);
    expect((screen.getByLabelText(/Peak bonus per order/) as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText(/Rainy-day bonus/) as HTMLInputElement).value).toBe("20");
    expect((screen.getByLabelText(/Streak — weeks in a row/) as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText(/Streak bonus/) as HTMLInputElement).value).toBe("1000");
    expect(screen.getByTestId("order-bonus-state")).toHaveTextContent("চালু আছে");
  });

  it("saves edits as the taka the admin typed, then confirms", async () => {
    const save = vi.fn(async () => true);
    state.hook = base({ save });
    render(<OrderBonusCard />);
    fireEvent.change(screen.getByLabelText(/Peak bonus per order/), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/Peak starts/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/Rainy-day bonus/), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Streak — weeks in a row/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Streak bonus/), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ peakBonusTaka: "25", peakStartHour: "20", peakEndHour: "22", rainBonusTaka: "15", streakWeeks: "3", streakBonusTaka: "300" }));
    expect(await screen.findByTestId("order-bonus-saved")).toBeTruthy();
  });

  it("shows a server error and no 'saved' when saving fails", async () => {
    state.hook = base({ error: "Peak-hour bonus must be between ৳0 and ৳200 (0 = off).", save: vi.fn(async () => false) });
    render(<OrderBonusCard />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/৳200/));
    expect(screen.queryByTestId("order-bonus-saved")).toBeNull();
  });
});
