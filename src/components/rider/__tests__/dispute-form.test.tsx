import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DisputeForm } from "../dispute-form";

describe("DisputeForm", () => {
  it("sends the chosen category, the words and the optional amount", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<DisputeForm orderNo="PS-1" onSubmit={onSubmit} onCancel={() => {}} />);
    const send = screen.getByRole("button", { name: "অভিযোগ পাঠান" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/সমস্যার ধরন/), { target: { value: "wrong_cod" } });
    fireEvent.change(screen.getByLabelText(/কী হয়েছে/), { target: { value: "কাস্টমার ৫০ টাকা কম দিয়েছেন" } });
    fireEvent.change(screen.getByLabelText(/কত টাকার হিসাব/), { target: { value: "50" } });
    fireEvent.click(send);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ category: "wrong_cod", message: "কাস্টমার ৫০ টাকা কম দিয়েছেন", claimedTaka: "50" });
  });

  it("omits an empty amount and shows the server's refusal", async () => {
    const onSubmit = vi.fn().mockResolvedValue("এই ট্রিপ নিয়ে আপনার একটি অভিযোগ আগে থেকেই অপেক্ষায় আছে।");
    render(<DisputeForm orderNo="PS-1" onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/কী হয়েছে/), { target: { value: "ফি আসেনি" } });
    fireEvent.click(screen.getByRole("button", { name: "অভিযোগ পাঠান" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("আগে থেকেই অপেক্ষায়");
    expect(onSubmit.mock.calls[0][0].claimedTaka).toBeUndefined();
  });

  it("cancel closes without sending", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(<DisputeForm orderNo="PS-1" onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
