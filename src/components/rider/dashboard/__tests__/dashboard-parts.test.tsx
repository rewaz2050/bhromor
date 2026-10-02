import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Order } from "@/lib/orders";
import type { RiderTask } from "@/lib/rider-tasks";

const uploads = vi.hoisted(() => ({ upload: vi.fn(), failed: vi.fn() }));
vi.mock("@/lib/rider-delivery-actions", () => ({
  uploadDeliveryProof: uploads.upload,
  reportFailedAttempt: uploads.failed,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { RiderTopBar } from "../top-bar";
import { CashCard } from "../cash-card";
import { StatsStrip } from "../stats-strip";
import { TaskCard } from "../task-card";
import { PinModal } from "../pin-modal";
import { SettleModal } from "../settle-modal";
import { FailedAttemptForm } from "../failed-attempt-form";

afterEach(() => {
  cleanup();
  uploads.upload.mockReset();
  uploads.failed.mockReset();
});

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "PS-1",
    customer: { name: "সালমা", phone: "01711111111", area: "Town", address: "House 1" },
    zoneName: "Town",
    items: [{ name: "Saree", qty: 1, unitPrice: 120000 }],
    subtotal: 120000, deliveryCharge: 5000, total: 125000,
    payment: "cod", paymentStatus: "verified", status: "ready-for-pickup", timeline: [],
    ...over,
  }) as unknown as Order;
const task = (state: RiderTask["state"], o: Order = order()): RiderTask => ({ id: "asg-1", order: o, state, expiresAt: 100_000 });

describe("RiderTopBar", () => {
  it("shows the rider, the socket state and toggles online", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RiderTopBar name="রফিক" live={false} isOnline={false} onToggle={onToggle} />);
    expect(screen.getByText("রফিক")).toBeInTheDocument();
    expect(screen.getByText("Polling")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /অফলাইন/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<RiderTopBar name="রফিক" live isOnline onToggle={onToggle} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /অনলাইন/ })).toBeInTheDocument();
  });
});

describe("CashCard", () => {
  const base = { cashInHand: 220000, limit: 500000, pendingClaim: null, claimsReady: true, earningsBalance: 0, onSettle: vi.fn() };
  it("shows custody, the limit, the settle button and a link to the statement", () => {
    render(<CashCard {...base} />);
    expect(screen.getByText("সীমা: ৳5,000")).toBeInTheDocument();
    expect(screen.getByText("৳2,200")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/টাকা জমা দিন/));
    expect(base.onSettle).toHaveBeenCalled();
    expect(screen.getByTestId("rider-earnings-link")).toHaveAttribute("href", "/rider/earnings");
  });
  it("no cash → no settle button; wallet shown only when positive and never as cash", () => {
    const { rerender } = render(<CashCard {...base} cashInHand={0} />);
    expect(screen.queryByText(/টাকা জমা দিন/)).toBeNull();
    expect(screen.queryByTestId("rider-earnings")).toBeNull();
    rerender(<CashCard {...base} cashInHand={0} earningsBalance={14000} />);
    expect(screen.getByTestId("rider-earnings")).toHaveTextContent("৳140");
    expect(screen.getByTestId("rider-earnings")).toHaveTextContent("হাতের ক্যাশ নয়");
  });
  it("explains a missing claim table and a pending claim", () => {
    const { rerender } = render(<CashCard {...base} claimsReady={false} />);
    expect(screen.getByText(/সাময়িকভাবে বন্ধ/)).toBeInTheDocument();
    expect(screen.queryByText(/টাকা জমা দিন/)).toBeNull();
    rerender(<CashCard {...base} pendingClaim={{ id: "c", amount: 100000, method: "bank", reference: "TX1" } as never} />);
    expect(screen.getByText(/BANK · TX1/)).toBeInTheDocument();
    expect(screen.queryByText(/টাকা জমা দিন/)).toBeNull();
  });
  it("the bar is red at the cap with a warning, amber in the warning band", () => {
    const { container, rerender } = render(<CashCard {...base} cashInHand={500000} />);
    expect(screen.getByText(/ক্যাশ লিমিট পূর্ণ/)).toBeInTheDocument();
    expect(container.querySelector(".bg-rose-600")).not.toBeNull();
    rerender(<CashCard {...base} cashInHand={400000} />);
    expect(container.querySelector(".bg-amber-500")).not.toBeNull();
    expect(screen.queryByText(/ক্যাশ লিমিট পূর্ণ/)).toBeNull();
  });
});

describe("StatsStrip", () => {
  it("shows placeholders until the stats arrive, never a fake zero", () => {
    render(<StatsStrip activeTrips={1} deliveredCount={2} stats={null} />);
    expect(screen.getAllByText("…")).toHaveLength(2);
    expect(screen.getByText("হিসাব হচ্ছে…")).toBeInTheDocument();
  });
  it("shows lifetime, week and rating, or 'no rating yet'", () => {
    const stats = { totalDeliveries: 41, weekDeliveries: 9, ratingAvg: 4.8, ratingCount: 12 };
    const { rerender } = render(<StatsStrip activeTrips={0} deliveredCount={0} stats={stats} />);
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("⭐ 4.8 (12)")).toBeInTheDocument();
    rerender(<StatsStrip activeTrips={0} deliveredCount={0} stats={{ ...stats, ratingCount: 0 }} />);
    expect(screen.getByText("এখনো রেটিং নেই")).toBeInTheDocument();
  });
});

describe("TaskCard", () => {
  const props = () => ({
    now: 90_000, isOnline: true, cashLimitReached: false, accepting: null as string | null,
    onAccept: vi.fn(), onReject: vi.fn(), onPickup: vi.fn(), onEnterCode: vi.fn(), onFailedRecorded: vi.fn(),
  });
  it("an offer counts down, can be declined, and is accepted with the task", () => {
    const p = props();
    render(<TaskCard task={task("offered")} {...p} />);
    expect(screen.getByTestId("rider-offer-countdown")).toHaveTextContent("10 সেকেন্ড");
    fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
    fireEvent.click(screen.getByText("অর্ডার একসেপ্ট করুন"));
    expect(p.onReject).toHaveBeenCalledWith(expect.objectContaining({ id: "asg-1" }));
    expect(p.onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: "asg-1" }));
    // before accepting, the customer's phone is hidden
    expect(screen.queryByText("কল দিন")).toBeNull();
  });
  it("Accept is blocked when offline, expired, over the cap, or another accept is running", () => {
    const base = props();
    const cases: Array<Partial<ReturnType<typeof props>> & { expired?: boolean }> = [
      { isOnline: false }, { now: 200_000 }, { cashLimitReached: true }, { accepting: "other" },
    ];
    for (const c of cases) {
      const { unmount } = render(<TaskCard task={task("offered")} {...base} {...c} />);
      expect(screen.getByText("অর্ডার একসেপ্ট করুন")).toBeDisabled();
      unmount();
    }
  });
  it("shows 'accepting…' only on the card being accepted", () => {
    render(<TaskCard task={task("offered")} {...props()} accepting="asg-1" />);
    expect(screen.getByText("গ্রহণ হচ্ছে…")).toBeInTheDocument();
  });
  it("accepted → pickup confirmation, with the customer call link and navigation", () => {
    const p = props();
    render(<TaskCard task={task("accepted")} {...p} />);
    fireEvent.click(screen.getByText("পিকআপ কনফার্ম করুন"));
    expect(p.onPickup).toHaveBeenCalled();
    expect(screen.getByText(/কল দিন/).closest("a")).toHaveAttribute("href", "tel:01711111111");
    expect(screen.getByTestId("rider-maps")).toBeInTheDocument();
    expect(screen.queryByText(/Report failed attempt/)).toBeNull();
  });
  it("picked up → enter the code, and the failed-attempt report becomes available", () => {
    const p = props();
    render(<TaskCard task={task("picked_up")} {...p} />);
    fireEvent.click(screen.getByText(/ডেলিভারি কোড দিন/));
    expect(p.onEnterCode).toHaveBeenCalledWith(expect.objectContaining({ id: "asg-1" }));
    expect(screen.getByText(/Report failed attempt/)).toBeInTheDocument();
  });
  it("says how much COD to collect, or that nothing is due", () => {
    const { rerender } = render(<TaskCard task={task("accepted")} {...props()} />);
    expect(screen.getByTestId("rider-cash")).toHaveTextContent("৳1,250");
    rerender(<TaskCard task={task("accepted", order({ payment: "bkash" } as Partial<Order>))} {...props()} />);
    expect(screen.getByTestId("rider-cash")).toHaveTextContent("কোনো টাকা নিবেন না");
    expect(screen.getByTestId("rider-cash")).toHaveTextContent("৳০");
  });
  it("shows the customer's note, and the shop to pick up from", () => {
    const o = order({ customer: { name: "সালমা", phone: "017", area: "Town", address: "H1", note: "গেটে রাখবেন" } } as Partial<Order>);
    const t = { ...task("accepted", o), pickupShop: { name: "Anam Fashion", address: "Zindabazar", phone: "01800000000" } } as RiderTask;
    render(<TaskCard task={t} {...props()} />);
    expect(screen.getByTestId("rider-note")).toHaveTextContent("গেটে রাখবেন");
    expect(screen.getByText(/Anam Fashion/)).toBeInTheDocument();
    expect(screen.getByText("দোকানে কল").closest("a")).toHaveAttribute("href", "tel:01800000000");
  });
});

describe("PinModal", () => {
  const mount = (onSubmit = vi.fn(async () => null as string | null)) => {
    const onClose = vi.fn();
    const onFlash = vi.fn();
    render(<PinModal onSubmit={onSubmit} onClose={onClose} onFlash={onFlash} />);
    return { onSubmit, onClose, onFlash };
  };
  it("the pin keeps digits only and Submit needs exactly four", () => {
    mount();
    const input = screen.getByPlaceholderText("• • • •");
    fireEvent.change(input, { target: { value: "12ab3" } });
    expect((input as HTMLInputElement).value).toBe("123");
    expect(screen.getByText("ডেলিভারি সম্পন্ন করুন")).toBeDisabled();
    fireEvent.change(input, { target: { value: "1234" } });
    expect(screen.getByText("ডেলিভারি সম্পন্ন করুন")).toBeEnabled();
  });
  it("a photo upload attaches the proof, flashes, and is sent with the code and no reason", async () => {
    uploads.upload.mockResolvedValue({ ok: true, url: "https://img/p.jpg" });
    const { onSubmit, onFlash } = mount();
    fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "4821" } });
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    expect(await screen.findByAltText("Delivery proof photo")).toBeInTheDocument();
    expect(onFlash).toHaveBeenCalledWith("📸 Proof photo uploaded!");
    expect(screen.queryByText("ছবি তুলতে পারছি না")).toBeNull();
    fireEvent.click(screen.getByText("ডেলিভারি সম্পন্ন করুন"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("4821", "https://img/p.jpg", null));
  });
  it("a failed upload shows why and opens the no-photo reason box", async () => {
    uploads.upload.mockResolvedValue({ ok: false, message: "Upload failed" });
    mount();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["x"], "p.jpg")] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(screen.getByLabelText(/ছবি ছাড়া ডেলিভারির কারণ/)).toBeInTheDocument();
  });
  it("a refusal from the server is shown and the dialog is not closed by the modal itself", async () => {
    const { onSubmit, onClose } = mount(vi.fn(async () => "Wrong delivery code."));
    fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "0000" } });
    fireEvent.click(screen.getByText("ডেলিভারি সম্পন্ন করুন"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong delivery code.");
    expect(onSubmit).toHaveBeenCalledWith("0000", null, null);
    expect(onClose).not.toHaveBeenCalled();
  });
  it("Cancel closes", () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SettleModal", () => {
  it("shows the amount, hides the reference for cash and requires it (≥3 chars) otherwise", async () => {
    const onSubmit = vi.fn(async () => null as string | null);
    render(<SettleModal cashInHand={220000} onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(screen.getByText(/৳2,200/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/9HXK2LM4PQ/)).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bank" } });
    fireEvent.click(screen.getByText("দাবি পাঠান"));
    expect(screen.getByRole("alert")).toHaveTextContent("reference/TRXID");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/9HXK2LM4PQ/), { target: { value: " AB " } });
    fireEvent.click(screen.getByText("দাবি পাঠান"));
    expect(screen.getByRole("alert")).toBeInTheDocument(); // "AB" is only 2 characters
    fireEvent.change(screen.getByPlaceholderText(/9HXK2LM4PQ/), { target: { value: " TRX123 " } });
    fireEvent.click(screen.getByText("দাবি পাঠান"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("bank", "TRX123"));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("shows a server refusal inline and Cancel closes", async () => {
    const onClose = vi.fn();
    render(<SettleModal cashInHand={100} onSubmit={async () => "Already pending"} onClose={onClose} />);
    fireEvent.click(screen.getByText("দাবি পাঠান"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Already pending");
    fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("FailedAttemptForm", () => {
  it("is closed until asked; the reason needs five characters", () => {
    render(<FailedAttemptForm assignmentId="a1" onRecorded={vi.fn()} />);
    expect(screen.queryByLabelText("Failed attempt reason")).toBeNull();
    fireEvent.click(screen.getByText(/Report failed attempt/));
    expect(screen.getByText("Submit failed")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), { target: { value: "  abc " } });
    expect(screen.getByText("Submit failed")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), { target: { value: "phone off" } });
    expect(screen.getByText("Submit failed")).toBeEnabled();
  });
  it("records the attempt, reports the message upward and closes", async () => {
    uploads.failed.mockResolvedValue({ ok: true, message: "recorded 1/2" });
    const onRecorded = vi.fn();
    render(<FailedAttemptForm assignmentId="a1" onRecorded={onRecorded} />);
    fireEvent.click(screen.getByText(/Report failed attempt/));
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), { target: { value: "phone off" } });
    fireEvent.click(screen.getByText("Submit failed"));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith("recorded 1/2"));
    expect(uploads.failed).toHaveBeenCalledWith("a1", "phone off");
    expect(screen.queryByLabelText("Failed attempt reason")).toBeNull();
  });
  it("a refusal is shown inline, keeps the form and the typed reason, and clears when typing resumes", async () => {
    uploads.failed.mockResolvedValue({ ok: false, message: "Nope" });
    const onRecorded = vi.fn();
    render(<FailedAttemptForm assignmentId="a1" onRecorded={onRecorded} />);
    fireEvent.click(screen.getByText(/Report failed attempt/));
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), { target: { value: "phone off" } });
    fireEvent.click(screen.getByText("Submit failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(onRecorded).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Failed attempt reason") as HTMLInputElement).value).toBe("phone off");
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), { target: { value: "phone off!" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("cannot be double-submitted while a request is in flight", async () => {
    let resolve!: (v: unknown) => void;
    uploads.failed.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<FailedAttemptForm assignmentId="a1" onRecorded={vi.fn()} />);
    fireEvent.click(screen.getByText(/Report failed attempt/));
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), { target: { value: "phone off" } });
    fireEvent.click(screen.getByText("Submit failed"));
    expect(screen.getByText("Submit failed")).toBeDisabled();
    fireEvent.click(screen.getByText("Submit failed"));
    expect(uploads.failed).toHaveBeenCalledTimes(1);
    resolve({ ok: true, message: "ok" });
    await waitFor(() => expect(screen.queryByLabelText("Failed attempt reason")).toBeNull());
  });
  it("Cancel closes without calling anything", () => {
    render(<FailedAttemptForm assignmentId="a1" onRecorded={vi.fn()} />);
    fireEvent.click(screen.getByText(/Report failed attempt/));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByLabelText("Failed attempt reason")).toBeNull();
    expect(uploads.failed).not.toHaveBeenCalled();
  });
});
