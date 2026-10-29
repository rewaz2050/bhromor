// @vitest-environment jsdom
/**
 * The counter-pickup override is the ONE way to close a pickup without the
 * customer's PIN. These tests pin the two things that make it safe: it only
 * exists for Admin/Super Admin on screen, and it cannot be sent without a
 * substantive reason (which SQL then writes into the order timeline).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ checked: true, canManage: true }));
vi.mock("@/lib/use-staff-role", () => ({ useStaffRole: () => access }));

import PickupHandover from "../pickup-handover";

beforeEach(() => {
  access.checked = true;
  access.canManage = true;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = () => {
  const verify = vi.fn(async () => true);
  const override = vi.fn(async () => true);
  render(<PickupHandover verify={verify} override={override} />);
  return { verify, override };
};

describe("counter-pickup override", () => {
  it("is not offered to a manager, or before the role is known", () => {
    access.canManage = false;
    const { rerender } = render(<PickupHandover verify={vi.fn()} override={vi.fn()} />);
    expect(screen.queryByText(/Customer lost the confirmation/)).toBeNull();
    access.canManage = true;
    access.checked = false;
    rerender(<PickupHandover verify={vi.fn()} override={vi.fn()} />);
    expect(screen.queryByText(/Customer lost the confirmation/)).toBeNull();
    expect(screen.queryByLabelText("Reason / কারণ")).toBeNull();
  });

  it("keeps the PIN as the primary action and never pre-fills it", () => {
    mount();
    expect(screen.getByRole("button", { name: /Verify PIN & hand over/ })).toBeDisabled();
    expect(screen.queryByDisplayValue("4821")).toBeNull();
  });

  it("refuses a short reason and never calls the server with it", async () => {
    const { override } = mount();
    fireEvent.click(screen.getByText(/Customer lost the confirmation/));
    const button = screen.getByRole("button", { name: /Hand over with recorded reason/ });
    const input = screen.getByLabelText("Reason / কারণ");
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "lost it" } });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(override).not.toHaveBeenCalled();
  });

  it("asks for confirmation, then sends the trimmed reason once", async () => {
    const { override } = mount();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText(/Customer lost the confirmation/));
    fireEvent.change(screen.getByLabelText("Reason / কারণ"), {
      target: { value: "  Customer showed the bKash TrxID and their national ID at Traffic Point  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Hand over with recorded reason/ }));
    await waitFor(() =>
      expect(override).toHaveBeenCalledExactlyOnceWith(
        "Customer showed the bKash TrxID and their national ID at Traffic Point",
      ),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText("Reason / কারণ")).toHaveValue(""));
  });

  it("sends nothing when the confirmation is dismissed", () => {
    const { override } = mount();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByText(/Customer lost the confirmation/));
    fireEvent.change(screen.getByLabelText("Reason / কারণ"), {
      target: { value: "Customer at the counter without the confirmation link" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Hand over with recorded reason/ }));
    expect(override).not.toHaveBeenCalled();
  });

  it("shows the server refusal instead of pretending the handover happened", async () => {
    const verify = vi.fn(async () => true);
    const override = vi.fn(async () => false);
    render(<PickupHandover verify={verify} override={override} />);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText(/Customer lost the confirmation/));
    fireEvent.change(screen.getByLabelText("Reason / কারণ"), {
      target: { value: "Customer at the counter without the confirmation link" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Hand over with recorded reason/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Override failed/));
    expect(screen.getByLabelText("Reason / কারণ")).not.toHaveValue("");
  });
});
