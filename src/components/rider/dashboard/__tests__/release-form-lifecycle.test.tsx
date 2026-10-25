import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock("@/lib/rider-delivery-actions", () => ({
  releaseAcceptedJob: api.release,
}));
import { ReleaseJobForm } from "../release-job-form";
const open = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /এই কাজটি করতে পারছেন না/ }),
  );
const cancel = () =>
  fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
const type = (reason = "Bike broke") =>
  fireEvent.change(screen.getByLabelText("Hand back reason"), {
    target: { value: reason },
  });
const send = () =>
  fireEvent.click(screen.getByRole("button", { name: "কাজ ফেরত দিন" }));
function deferred() {
  let resolve!: (result: unknown) => void;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  api.release.mockReset();
  api.release.mockResolvedValue({ ok: true, message: "Released" });
});
afterEach(cleanup);
it.each([true, false])(
  "cancel/reopen ignores the previous result, but retains its transport lock (success=%s)",
  async (success) => {
    const pending = deferred();
    api.release.mockReturnValueOnce(pending.promise);
    const released = vi.fn();
    render(<ReleaseJobForm assignmentId="a" onReleased={released} />);
    open();
    type();
    send();
    cancel();
    open();
    type("Current draft");
    expect(screen.getByRole("button", { name: "ফেরত হচ্ছে…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "ফেরত হচ্ছে…" }));
    expect(api.release).toHaveBeenCalledOnce();
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, message: "Old success" }
          : { ok: false, message: "Old refusal" },
      );
    });
    expect(screen.getByLabelText("Hand back reason")).toHaveValue(
      "Current draft",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(released).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "কাজ ফেরত দিন" })).toBeEnabled();
  },
);
it.each([true, false])(
  "assignment change discards the old result/callback (success=%s)",
  async (success) => {
    const pending = deferred();
    api.release.mockReturnValueOnce(pending.promise);
    const first = vi.fn(),
      second = vi.fn();
    const { rerender } = render(
      <ReleaseJobForm assignmentId="a" onReleased={first} />,
    );
    open();
    type();
    send();
    rerender(<ReleaseJobForm assignmentId="b" onReleased={second} />);
    expect(screen.queryByLabelText("Hand back reason")).not.toBeInTheDocument();
    open();
    type("New B draft");
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, message: "Old success" }
          : { ok: false, message: "Old refusal" },
      );
    });
    expect(screen.getByLabelText("Hand back reason")).toHaveValue(
      "New B draft",
    );
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);
it.each([true, false])(
  "completion after unmount does not notify the parent (success=%s)",
  async (success) => {
    const pending = deferred();
    api.release.mockReturnValueOnce(pending.promise);
    const released = vi.fn();
    const { unmount } = render(
      <ReleaseJobForm assignmentId="a" onReleased={released} />,
    );
    open();
    type();
    send();
    unmount();
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, message: "Old success" }
          : { ok: false, message: "Old refusal" },
      );
    });
    expect(released).not.toHaveBeenCalled();
  },
);
it("toggle-close invalidates the same open lifetime as Cancel", async () => {
  const pending = deferred();
  api.release.mockReturnValueOnce(pending.promise);
  const released = vi.fn();
  render(<ReleaseJobForm assignmentId="a" onReleased={released} />);
  open();
  type();
  send();
  open();
  open();
  type("Reopened draft");
  await act(async () => {
    pending.resolve({ ok: true, message: "Old success" });
  });
  expect(screen.getByLabelText("Hand back reason")).toHaveValue(
    "Reopened draft",
  );
  expect(released).not.toHaveBeenCalled();
});
it("assignment change clears a completed draft/error and pending status", async () => {
  api.release.mockResolvedValueOnce({ ok: false, message: "Refused" });
  const { rerender } = render(
    <ReleaseJobForm assignmentId="a" onReleased={vi.fn()} />,
  );
  open();
  type();
  send();
  await screen.findByRole("alert");
  rerender(<ReleaseJobForm assignmentId="b" onReleased={vi.fn()} />);
  expect(screen.queryByLabelText("Hand back reason")).not.toBeInTheDocument();
  open();
  expect(screen.getByLabelText("Hand back reason")).toHaveValue("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "কাজ ফেরত দিন" })).toBeDisabled();
});
it("A → B → A does not reactivate the old A instance", async () => {
  const pending = deferred();
  api.release.mockReturnValueOnce(pending.promise);
  const released = vi.fn();
  const { rerender } = render(
    <ReleaseJobForm assignmentId="a" onReleased={released} />,
  );
  open();
  type();
  send();
  rerender(<ReleaseJobForm assignmentId="b" onReleased={released} />);
  rerender(<ReleaseJobForm assignmentId="a" onReleased={released} />);
  open();
  type("New A draft");
  await act(async () => {
    pending.resolve({ ok: true, message: "Old A result" });
  });
  expect(released).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Hand back reason")).toHaveValue("New A draft");
});
it("old A completion cannot release B's pending write lock", async () => {
  const first = deferred(),
    second = deferred();
  api.release
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const released = vi.fn();
  const { rerender } = render(
    <ReleaseJobForm assignmentId="a" onReleased={released} />,
  );
  open();
  type();
  send();
  rerender(<ReleaseJobForm assignmentId="b" onReleased={released} />);
  open();
  type();
  send();
  await act(async () => {
    first.resolve({ ok: true, message: "Old A" });
  });
  expect(screen.getByRole("button", { name: "ফেরত হচ্ছে…" })).toBeDisabled();
  expect(released).not.toHaveBeenCalled();
  await act(async () => {
    second.resolve({ ok: true, message: "Current B" });
  });
  expect(released).toHaveBeenCalledExactlyOnceWith("Current B");
});
it("unexpected helper rejection releases busy safely and permits explicit retry", async () => {
  api.release.mockRejectedValueOnce(new Error("Private browser detail"));
  const released = vi.fn();
  render(<ReleaseJobForm assignmentId="a" onReleased={released} />);
  open();
  type();
  send();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "ফেরত দেওয়া যায়নি — আবার চেষ্টা করুন।",
  );
  expect(screen.getByLabelText("Hand back reason")).toHaveValue("Bike broke");
  expect(screen.getByRole("button", { name: "কাজ ফেরত দিন" })).toBeEnabled();
  expect(released).not.toHaveBeenCalled();
  send();
  await waitFor(() =>
    expect(released).toHaveBeenCalledExactlyOnceWith("Released"),
  );
});
it("preserves same-assignment draft on Cancel/reopen", () => {
  render(<ReleaseJobForm assignmentId="a" onReleased={vi.fn()} />);
  open();
  type();
  cancel();
  open();
  expect(screen.getByLabelText("Hand back reason")).toHaveValue("Bike broke");
  expect(api.release).not.toHaveBeenCalled();
});
it("preserves current successful payload, callback and close behavior", async () => {
  const released = vi.fn();
  render(<ReleaseJobForm assignmentId="a/id" onReleased={released} />);
  open();
  type("Bike broke");
  send();
  await waitFor(() =>
    expect(released).toHaveBeenCalledExactlyOnceWith("Released"),
  );
  expect(api.release).toHaveBeenCalledExactlyOnceWith("a/id", "Bike broke");
  expect(screen.queryByLabelText("Hand back reason")).not.toBeInTheDocument();
});
