import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  config: vi.fn(),
  upload: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/rider-delivery-actions", () => ({
  fetchFailedProofConfig: api.config,
  uploadDeliveryProof: api.upload,
  reportFailedAttempt: api.report,
}));
import { FailedAttemptForm } from "../failed-attempt-form";
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const open = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /Report failed attempt/ }),
  );
const close = () =>
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
const reason = (value = "Phone unavailable") =>
  fireEvent.change(screen.getByLabelText("Failed attempt reason"), {
    target: { value },
  });
async function photo(name = "door.jpg") {
  const input = await screen.findByLabelText("Failed attempt photo");
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(["x"], name, { type: "image/jpeg" })] },
    });
  });
}
beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.config.mockResolvedValue({ mode: 2, uploads: true });
  api.upload.mockResolvedValue({
    ok: true,
    url: "https://fixture.invalid/new.jpg",
  });
  api.report.mockResolvedValue({ ok: true, message: "Recorded" });
});
afterEach(cleanup);
it.each([true, false])(
  "old upload completion after close/reopen is ignored (success=%s)",
  async (success) => {
    const pending = deferred();
    api.upload.mockReturnValueOnce(pending.promise);
    render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
    open();
    await photo();
    close();
    open();
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, url: "https://fixture.invalid/old.jpg" }
          : { ok: false, message: "Old upload error" },
      );
    });
    expect(screen.queryByTestId("failed-proof-ok")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);
it.each([true, false])(
  "old upload completion cannot modify a new assignment (success=%s)",
  async (success) => {
    const pending = deferred();
    api.upload.mockReturnValueOnce(pending.promise);
    const onRecorded = vi.fn();
    const { rerender } = render(
      <FailedAttemptForm assignmentId="a" onRecorded={onRecorded} />,
    );
    open();
    await photo();
    rerender(<FailedAttemptForm assignmentId="b" onRecorded={onRecorded} />);
    expect(
      screen.queryByLabelText("Failed attempt reason"),
    ).not.toBeInTheDocument();
    open();
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, url: "https://fixture.invalid/old.jpg" }
          : { ok: false, message: "Old upload error" },
      );
    });
    expect(screen.queryByTestId("failed-proof-ok")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);
it.each([true, false])(
  "older upload does not release the newest upload lock (success=%s)",
  async (success) => {
    const first = deferred(),
      second = deferred();
    api.upload
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
    open();
    reason();
    await photo("first.jpg");
    await photo("second.jpg");
    await act(async () => {
      first.resolve(
        success
          ? { ok: true, url: "https://fixture.invalid/old.jpg" }
          : { ok: false, message: "Old upload error" },
      );
    });
    expect(screen.getByText("Submit failed")).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {
      second.resolve({ ok: true, url: "https://fixture.invalid/new.jpg" });
    });
    expect(screen.getByText("Submit failed")).toBeEnabled();
  },
);
it("out-of-order uploads submit only the newest chosen photo URL", async () => {
  const first = deferred();
  api.upload.mockReturnValueOnce(first.promise);
  render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
  await act(async () => {
    open();
  });
  reason();
  await photo("first.jpg");
  await photo("second.jpg");
  await screen.findByTestId("failed-proof-ok");
  await act(async () => {
    first.resolve({ ok: true, url: "https://fixture.invalid/old.jpg" });
  });
  fireEvent.click(screen.getByText("Submit failed"));
  await waitFor(() =>
    expect(api.report).toHaveBeenCalledWith("a", "Phone unavailable", {
      proofUrl: "https://fixture.invalid/new.jpg",
      noPhotoReason: null,
    }),
  );
});
it.each([true, false])(
  "old report after cancel/reopen cannot close/reset/flash the current form (success=%s)",
  async (success) => {
    const pending = deferred();
    api.report.mockReturnValueOnce(pending.promise);
    const onRecorded = vi.fn();
    render(<FailedAttemptForm assignmentId="a" onRecorded={onRecorded} />);
    open();
    reason();
    fireEvent.click(screen.getByText("Submit failed"));
    close();
    open();
    reason("Current draft");
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, message: "Old success" }
          : { ok: false, message: "Old refusal" },
      );
    });
    expect(screen.getByLabelText("Failed attempt reason")).toHaveValue(
      "Current draft",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onRecorded).not.toHaveBeenCalled();
  },
);
it.each([true, false])(
  "old report cannot notify the next assignment's callback (success=%s)",
  async (success) => {
    const pending = deferred();
    api.report.mockReturnValueOnce(pending.promise);
    const first = vi.fn(),
      next = vi.fn();
    const { rerender } = render(
      <FailedAttemptForm assignmentId="a" onRecorded={first} />,
    );
    open();
    reason();
    fireEvent.click(screen.getByText("Submit failed"));
    rerender(<FailedAttemptForm assignmentId="b" onRecorded={next} />);
    expect(
      screen.queryByLabelText("Failed attempt reason"),
    ).not.toBeInTheDocument();
    open();
    reason("Current draft");
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, message: "Old success" }
          : { ok: false, message: "Old refusal" },
      );
    });
    expect(first).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Failed attempt reason")).toHaveValue(
      "Current draft",
    );
  },
);
it("an older settings response cannot replace the newest open's photo requirement", async () => {
  const pending = deferred();
  api.config
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ mode: 2, uploads: true });
  render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
  await act(async () => {
    open();
  });
  close();
  await act(async () => {
    open();
  });
  await screen.findByLabelText("Failed attempt photo");
  await act(async () => {
    pending.resolve({ mode: 0, uploads: false });
  });
  expect(screen.getByLabelText("Failed attempt photo")).toBeInTheDocument();
});
it("assignment change resets completed proof and drafts, not only pending requests", async () => {
  const { rerender } = render(
    <FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />,
  );
  await act(async () => {
    open();
  });
  reason();
  await photo();
  await screen.findByTestId("failed-proof-ok");
  rerender(<FailedAttemptForm assignmentId="b" onRecorded={vi.fn()} />);
  expect(
    screen.queryByLabelText("Failed attempt reason"),
  ).not.toBeInTheDocument();
  await act(async () => {
    open();
  });
  expect(screen.getByLabelText("Failed attempt reason")).toHaveValue("");
  expect(screen.queryByTestId("failed-proof-ok")).not.toBeInTheDocument();
});
it("report completion after unmount does not call onRecorded", async () => {
  const pending = deferred();
  api.report.mockReturnValueOnce(pending.promise);
  const recorded = vi.fn();
  const { unmount } = render(
    <FailedAttemptForm assignmentId="a" onRecorded={recorded} />,
  );
  await act(async () => {
    open();
  });
  reason();
  fireEvent.click(screen.getByText("Submit failed"));
  unmount();
  await act(async () => {
    pending.resolve({ ok: true, message: "Old success" });
  });
  expect(recorded).not.toHaveBeenCalled();
});

it.each([true, false])(
  "pending report lock survives close/reopen without sending twice (success=%s)",
  async (success) => {
    const pending = deferred();
    api.report.mockReturnValueOnce(pending.promise);
    const recorded = vi.fn();
    render(<FailedAttemptForm assignmentId="a" onRecorded={recorded} />);
    await act(async () => {
      open();
    });
    reason();
    fireEvent.click(screen.getByText("Submit failed"));
    close();
    await act(async () => {
      open();
    });
    reason("Current draft");
    expect(screen.getByText("Submit failed")).toBeDisabled();
    fireEvent.click(screen.getByText("Submit failed"));
    expect(api.report).toHaveBeenCalledOnce();
    await act(async () => {
      pending.resolve(
        success
          ? { ok: true, message: "Old recorded" }
          : { ok: false, message: "Old error" },
      );
    });
    expect(screen.getByText("Submit failed")).toBeEnabled();
    expect(recorded).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Failed attempt reason")).toHaveValue(
      "Current draft",
    );
  },
);

it.each([true, false])(
  "old upload cannot clear the next open's upload lock (success=%s)",
  async (success) => {
    const old = deferred(),
      current = deferred();
    api.upload
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
    open();
    reason();
    await photo();
    close();
    open();
    await photo();
    await act(async () => {
      old.resolve(
        success
          ? { ok: true, url: "https://fixture.invalid/old.jpg" }
          : { ok: false, message: "Old error" },
      );
    });
    expect(screen.getByText("Submit failed")).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {
      current.resolve({ ok: true, url: "https://fixture.invalid/new.jpg" });
    });
    expect(screen.getByText("Submit failed")).toBeEnabled();
  },
);
it("unexpected upload rejection releases its own lock and allows a retry", async () => {
  api.upload.mockRejectedValueOnce(new Error("Private upload detail"));
  render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
  await act(async () => {
    open();
  });
  reason();
  await photo();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Photo upload failed — please try again.",
  );
  expect(screen.getByText("Submit failed")).toBeEnabled();
  expect(screen.getByLabelText("Reason no photo")).toBeInTheDocument();
  await photo("retry.jpg");
  await screen.findByTestId("failed-proof-ok");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("unexpected report rejection keeps the draft, clears busy and allows explicit retry", async () => {
  api.report.mockRejectedValueOnce(new Error("Private report detail"));
  const recorded = vi.fn();
  render(<FailedAttemptForm assignmentId="a" onRecorded={recorded} />);
  await act(async () => {
    open();
  });
  reason();
  fireEvent.click(screen.getByText("Submit failed"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Failed — try again.",
  );
  expect(screen.getByLabelText("Failed attempt reason")).toHaveValue(
    "Phone unavailable",
  );
  expect(screen.getByText("Submit failed")).toBeEnabled();
  expect(recorded).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Submit failed"));
  await waitFor(() =>
    expect(recorded).toHaveBeenCalledExactlyOnceWith("Recorded"),
  );
});
it("closing/reopening the same assignment preserves completed draft/proof", async () => {
  render(<FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />);
  await act(async () => {
    open();
  });
  reason();
  await photo();
  await screen.findByTestId("failed-proof-ok");
  close();
  await act(async () => {
    open();
  });
  expect(screen.getByLabelText("Failed attempt reason")).toHaveValue(
    "Phone unavailable",
  );
  expect(screen.getByTestId("failed-proof-ok")).toBeInTheDocument();
});
it("reusing assignment A after visiting B does not reactivate A's old callback", async () => {
  const pending = deferred();
  api.report.mockReturnValueOnce(pending.promise);
  const recorded = vi.fn();
  const { rerender } = render(
    <FailedAttemptForm assignmentId="a" onRecorded={recorded} />,
  );
  await act(async () => {
    open();
  });
  reason();
  fireEvent.click(screen.getByText("Submit failed"));
  rerender(<FailedAttemptForm assignmentId="b" onRecorded={recorded} />);
  rerender(<FailedAttemptForm assignmentId="a" onRecorded={recorded} />);
  await act(async () => {
    open();
  });
  reason("New A draft");
  await act(async () => {
    pending.resolve({ ok: true, message: "Old A recorded" });
  });
  expect(recorded).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Failed attempt reason")).toHaveValue(
    "New A draft",
  );
});
it("old assignment config cannot change the next assignment's requirement", async () => {
  const pending = deferred();
  api.config.mockReturnValueOnce(pending.promise);
  const { rerender } = render(
    <FailedAttemptForm assignmentId="a" onRecorded={vi.fn()} />,
  );
  await act(async () => {
    open();
  });
  rerender(<FailedAttemptForm assignmentId="b" onRecorded={vi.fn()} />);
  await act(async () => {
    open();
  });
  await screen.findByLabelText("Failed attempt photo");
  await act(async () => {
    pending.resolve({ mode: 0, uploads: false });
  });
  expect(screen.getByLabelText("Failed attempt photo")).toBeInTheDocument();
});
