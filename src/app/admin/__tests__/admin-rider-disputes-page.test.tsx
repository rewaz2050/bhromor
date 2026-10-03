import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminDispute } from "@/lib/rider-disputes";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown>, decide: vi.fn(), tabs: [] as string[] }));
vi.mock("@/lib/use-admin-rider-disputes", () => ({
  useAdminRiderDisputes: (tab: string) => {
    state.tabs.push(tab);
    return state.hook;
  },
}));

import RiderDisputesPage from "../riders/disputes/page";

const dispute = (over: Partial<AdminDispute> = {}): AdminDispute => ({
  id: "d1", riderId: "r1", riderName: "Rafiq", category: "missing_fee", message: "Fee not credited for PS-1001", orderNo: "PS-1001",
  claimedAmount: 4000, status: "pending", adjustmentAmount: 0, note: null, at: Date.now(), decidedAt: null, ...over,
});

beforeEach(() => {
  state.tabs = [];
  state.decide.mockReset().mockResolvedValue(null);
  state.hook = { live: true, checked: true, items: [dispute()], ready: true, loaded: true, error: null, refresh: vi.fn(), decide: state.decide };
});

describe("/admin/riders/disputes", () => {
  it("shows the rider, category, order, claim and the complaint in their words", () => {
    render(<RiderDisputesPage />);
    const row = screen.getByTestId("dispute-row");
    expect(row).toHaveTextContent("Rafiq");
    expect(row).toHaveTextContent("Delivery fee missing");
    expect(row).toHaveTextContent("#PS-1001");
    expect(row).toHaveTextContent("claims ৳40");
    expect(row).toHaveTextContent("Fee not credited for PS-1001");
  });

  it("pre-fills the claimed amount and approves with the signed wallet change + note", async () => {
    render(<RiderDisputesPage />);
    const amount = screen.getByLabelText("Wallet change in taka") as HTMLInputElement;
    expect(amount.value).toBe("40");
    fireEvent.change(screen.getByLabelText("Note to the rider"), { target: { value: "Fee missed by the system" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("d1", { decision: "approve", amountTaka: "40", note: "Fee missed by the system" }));
  });

  it("rejecting sends no amount, and a server refusal is shown inline", async () => {
    state.decide.mockResolvedValue("Give the rider a reason (a few words) — they read it.");
    render(<RiderDisputesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the rider a reason");
    expect(state.decide).toHaveBeenCalledWith("d1", { decision: "reject", amountTaka: undefined, note: "" });
  });

  it("decided tab lists the outcome and wallet change without a form", () => {
    state.hook.items = [dispute({ status: "approved", adjustmentAmount: -1500, note: "Penalty applied", decidedAt: Date.now() })];
    render(<RiderDisputesPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Decided" }));
    expect(state.tabs).toContain("decided");
    const row = screen.getByTestId("dispute-row");
    expect(row).toHaveTextContent("Approved · wallet −৳15 · Penalty applied");
    expect(within(row).queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("explains the migration when disputes are not set up; empty state otherwise", () => {
    state.hook.ready = false;
    state.hook.items = [];
    const { unmount } = render(<RiderDisputesPage />);
    expect(screen.getByTestId("disputes-missing")).toHaveTextContent("202610020007");
    unmount();
    state.hook.ready = true;
    render(<RiderDisputesPage />);
    expect(screen.getByText("No open disputes.")).toBeInTheDocument();
  });
});
