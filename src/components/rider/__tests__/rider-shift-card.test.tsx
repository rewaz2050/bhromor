import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RiderShiftCard } from "../rider-shift-card";
import type { Rider } from "@/lib/catalog";
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const rider = (id: string, fromHour: number | null = null) =>
  ({
    id,
    availability: { fromHour, toHour: null, days: [] },
  }) as unknown as Rider;
afterEach(cleanup);
function edit() {
  fireEvent.change(screen.getByLabelText("Shift start hour (Dhaka)"), {
    target: { value: "8" },
  });
}
it("new rider gets its own shift draft", () => {
  const onSave = vi.fn(async () => null),
    flash = vi.fn();
  const h = render(
    <RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />,
  );
  edit();
  h.rerender(
    <RiderShiftCard rider={rider("b", 10)} onSave={onSave} flash={flash} />,
  );
  expect(
    (screen.getByLabelText("Shift start hour (Dhaka)") as HTMLSelectElement)
      .value,
  ).toBe("10");
});
it("old successful save cannot flash in a replacement rider's view", async () => {
  const pending = deferred<string | null>(),
    onSave = vi.fn(() => pending.promise),
    flash = vi.fn();
  const h = render(
    <RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />,
  );
  edit();
  fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  h.rerender(
    <RiderShiftCard rider={rider("b")} onSave={onSave} flash={flash} />,
  );
  await act(async () => {
    pending.resolve(null);
  });
  expect(flash).not.toHaveBeenCalled();
});
it("old refusal cannot appear in a replacement rider's view", async () => {
  const pending = deferred<string | null>(),
    onSave = vi.fn(() => pending.promise),
    flash = vi.fn();
  const h = render(
    <RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />,
  );
  edit();
  fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  h.rerender(
    <RiderShiftCard rider={rider("b")} onSave={onSave} flash={flash} />,
  );
  await act(async () => {
    pending.resolve("A private refusal");
  });
  expect(screen.queryByText("A private refusal")).toBeNull();
});
it("unmounted completion cannot flash", async () => {
  const pending = deferred<string | null>(),
    onSave = vi.fn(() => pending.promise),
    flash = vi.fn();
  const h = render(
    <RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />,
  );
  edit();
  fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  h.unmount();
  await act(async () => {
    pending.resolve(null);
  });
  expect(flash).not.toHaveBeenCalled();
});
it("pending save freezes its editable controls", async () => {
  const pending = deferred<string | null>(),
    onSave = vi.fn(() => pending.promise);
  render(<RiderShiftCard rider={rider("a")} onSave={onSave} flash={vi.fn()} />);
  edit();
  fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  expect(
    (screen.getByLabelText("Shift start hour (Dhaka)") as HTMLSelectElement)
      .disabled,
  ).toBe(true);
  expect((screen.getByTitle("Monday") as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    pending.resolve("Refused");
  });
  expect(
    (screen.getByLabelText("Shift start hour (Dhaka)") as HTMLSelectElement)
      .disabled,
  ).toBe(false);
});
it("current save preserves hours, sorted days and success feedback", async () => {
  const onSave = vi.fn(async () => null),
    flash = vi.fn();
  render(<RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />);
  edit();
  fireEvent.click(screen.getByTitle("Friday"));
  fireEvent.click(screen.getByTitle("Monday"));
  await act(async () => {
    fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  });
  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    fromHour: 8,
    toHour: null,
    days: [1, 5],
  });
  expect(flash).toHaveBeenCalledTimes(1);
});
it("new rider's pending save stays busy after old save finishes", async () => {
  const a = deferred<string | null>(),
    b = deferred<string | null>(),
    onSave = vi
      .fn()
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise),
    flash = vi.fn();
  const h = render(
    <RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />,
  );
  edit();
  fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  h.rerender(
    <RiderShiftCard rider={rider("b")} onSave={onSave} flash={flash} />,
  );
  edit();
  fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  expect(onSave).toHaveBeenCalledTimes(2);
  await act(async () => {
    a.resolve(null);
  });
  expect((screen.getByText("সেভ হচ্ছে…") as HTMLButtonElement).disabled).toBe(
    true,
  );
  await act(async () => {
    b.resolve(null);
  });
  expect(flash).toHaveBeenCalledTimes(1);
});
it("unexpected save rejection shows a safe error and releases controls for retry", async () => {
  const onSave = vi
      .fn<
        (payload: {
          fromHour: number | null;
          toHour: number | null;
          days: number[];
        }) => Promise<string | null>
      >()
      .mockRejectedValueOnce(new Error("Private transport detail"))
      .mockResolvedValueOnce(null),
    flash = vi.fn();
  render(<RiderShiftCard rider={rider("a")} onSave={onSave} flash={flash} />);
  edit();
  await act(async () => {
    fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "শিফট সেভ নিশ্চিত করা যায়নি — আবার চেষ্টা করুন।",
  );
  expect(
    (screen.getByLabelText("Shift start hour (Dhaka)") as HTMLSelectElement)
      .disabled,
  ).toBe(false);
  expect(flash).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByText("শিফট সেভ করুন"));
  });
  expect(flash).toHaveBeenCalledTimes(1);
});
