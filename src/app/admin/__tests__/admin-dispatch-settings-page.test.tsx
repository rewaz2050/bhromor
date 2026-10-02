import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-dispatch-settings", () => ({ useDispatchSettings: () => state.hook }));

import DispatchRulesPage from "../riders/settings/page";

const base = (over: Record<string, unknown> = {}) => ({
  live: true, checked: true, loaded: true, error: null,
  settings: { cashCap: 500000, offerTtl: 90, maxAttempts: 2, loadLimit: 2, failedFee: 0 },
  save: vi.fn(async () => true), clearError: vi.fn(), ...over,
});

afterEach(cleanup);

describe("<DispatchRulesPage>", () => {
  it("shows the saved values, cash in taka", () => {
    state.hook = base({ settings: { cashCap: 300000, offerTtl: 60, maxAttempts: 3, loadLimit: 2, failedFee: 0 } });
    render(<DispatchRulesPage />);
    expect((screen.getByLabelText(/Rider cash limit/) as HTMLInputElement).value).toBe("3000");
    expect((screen.getByLabelText(/Offer window/) as HTMLInputElement).value).toBe("60");
    expect((screen.getByLabelText(/Max delivery attempts/) as HTMLInputElement).value).toBe("3");
  });

  it("saves edits as paisa / seconds / attempts and confirms", async () => {
    const save = vi.fn(async () => true);
    state.hook = base({ save });
    render(<DispatchRulesPage />);
    fireEvent.change(screen.getByLabelText(/Rider cash limit/), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText(/Offer window/), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText(/Max delivery attempts/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/Active jobs per rider/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/Failed-delivery fee/), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ cashCap: 250000, offerTtl: 45, maxAttempts: 3, loadLimit: 4, failedFee: 20000 }));
    expect(await screen.findByTestId("dispatch-saved")).toBeInTheDocument();
  });

  it("restore-defaults refills the old values without saving", () => {
    const save = vi.fn(async () => true);
    state.hook = base({ save, settings: { cashCap: 300000, offerTtl: 60, maxAttempts: 3, loadLimit: 2, failedFee: 0 } });
    render(<DispatchRulesPage />);
    fireEvent.click(screen.getByRole("button", { name: /আগের মানে ফেরান/ }));
    expect((screen.getByLabelText(/Rider cash limit/) as HTMLInputElement).value).toBe("5000");
    expect((screen.getByLabelText(/Offer window/) as HTMLInputElement).value).toBe("90");
    expect((screen.getByLabelText(/Active jobs per rider/) as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText(/Failed-delivery fee/) as HTMLInputElement).value).toBe("0");
    expect(save).not.toHaveBeenCalled();
  });

  it("a refused save shows the server message and no success banner", async () => {
    state.hook = base({ save: vi.fn(async () => false), error: "Offer window (seconds) must be a whole number between 30 – 600." });
    render(<DispatchRulesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Offer window"));
    expect(screen.queryByTestId("dispatch-saved")).toBeNull();
  });

  it("needs a staff session", () => {
    state.hook = base({ live: false });
    render(<DispatchRulesPage />);
    expect(screen.getByText(/sign in করুন/)).toBeInTheDocument();
    expect(screen.queryByTestId("dispatch-form")).toBeNull();
  });
});
