import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({
  apiSend: (...a: unknown[]) => api.send(...a),
  apiErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "error"),
}));

import { RiderAdjustCard } from "../rider-adjust-card";

beforeEach(() => api.send.mockReset().mockResolvedValue({}));
afterEach(() => vi.restoreAllMocks());

const fill = (amount: string, note: string) => {
  fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: note } });
};

describe("RiderAdjustCard", () => {
  it("needs a non-zero amount AND a reason before Apply is enabled", () => {
    render(<RiderAdjustCard riderId="r1" />);
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    fill("0", "Eid bonus for the rider");
    expect(apply).toBeDisabled();
    fill("50", "no");
    expect(apply).toBeDisabled();
    fill("50", "Eid bonus for the rider");
    expect(apply).toBeEnabled();
  });

  it("asks for confirmation, then posts taka + reason and refreshes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const done = vi.fn();
    render(<RiderAdjustCard riderId="r1" onDone={done} />);
    fill("-30", "Damaged parcel penalty");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("DEBIT ৳30 from"));
    expect(api.send).toHaveBeenCalledWith("/api/admin/riders/r1/adjust", "POST", { amountTaka: "-30", note: "Damaged parcel penalty" });
    expect(screen.getByRole("status")).toHaveTextContent("rider has been told");
  });

  it("does nothing if staff decline the confirmation; shows a refusal from the server", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RiderAdjustCard riderId="r1" />);
    fill("20", "Goodwill bonus for delay");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(api.send).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    api.send.mockRejectedValue(new Error("That debit is bigger than the rider's wallet balance."));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("bigger than the rider's wallet");
  });
});
