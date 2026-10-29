import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProofUpload } from "@/lib/rider-delivery-actions";
const api = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/rider-delivery-actions", () => ({ uploadDeliveryProof: api.upload }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) =>
  // eslint-disable-next-line @next/next/no-img-element
  <img src={src} alt={alt} /> }));
import { PinModal } from "../pin-modal";
function deferred() {
  let resolve!: (value: ProofUpload) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ProofUpload>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount() {
  const props = { onSubmit: vi.fn(async () => null as string | null), onClose: vi.fn(), onFlash: vi.fn() };
  return { ...render(<PinModal {...props} />), ...props };
}
const choose = (name: string) => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File([name], name, { type: "image/jpeg" })] } });
const code = () => fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "1234" } });
const submit = () => screen.getByRole("button", { name: "ডেলিভারি সম্পন্ন করুন" });
const photo = () => screen.getByAltText("Delivery proof photo");
const success = (name: string): ProofUpload => ({ ok: true, url: `https://img/${name}.jpg` });
beforeEach(() => { api.upload.mockReset(); });
afterEach(cleanup);
it("latest selection owns proof even if an older successful upload finishes last", async () => {
  const a = deferred(), b = deferred(); api.upload.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const { onSubmit, onFlash } = mount(); code(); choose("a.jpg"); choose("b.jpg");
  await act(async () => { b.resolve(success("b")); });
  await act(async () => { a.resolve(success("a")); });
  expect(photo()).toHaveAttribute("src", "https://img/b.jpg"); expect(onFlash).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(submit()); }); expect(onSubmit).toHaveBeenCalledWith("1234", "https://img/b.jpg", null);
});
it.each([true, false])("older completion cannot clear the newest upload's busy lock (success=%s)", async ok => {
  const a = deferred(), b = deferred(); api.upload.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const { onSubmit, onFlash } = mount(); code(); choose("a.jpg"); choose("b.jpg");
  await act(async () => { a.resolve(ok ? success("a") : { ok: false, message: "Old failure" }); });
  expect(screen.getByText("Uploading to Cloudinary...")).toBeInTheDocument(); expect(submit()).toBeDisabled();
  fireEvent.click(submit()); expect(onSubmit).not.toHaveBeenCalled(); expect(onFlash).not.toHaveBeenCalled(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => { b.resolve(success("b")); }); expect(submit()).toBeEnabled();
});
it("older refusal cannot replace the newest success with an error", async () => {
  const a = deferred(), b = deferred(); api.upload.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); mount(); choose("a.jpg"); choose("b.jpg");
  await act(async () => { b.resolve(success("b")); a.resolve({ ok: false, message: "Old refusal" }); });
  expect(photo()).toHaveAttribute("src", "https://img/b.jpg"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("older success cannot attach proof after the newest selection failed", async () => {
  const a = deferred(), b = deferred(); api.upload.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); const { onFlash } = mount(); choose("a.jpg"); choose("b.jpg");
  await act(async () => { b.resolve({ ok: false, message: "Current refusal" }); a.resolve(success("a")); });
  expect(screen.queryByAltText("Delivery proof photo")).not.toBeInTheDocument(); expect(screen.getByRole("alert")).toHaveTextContent("Current refusal"); expect(onFlash).not.toHaveBeenCalled();
});
it("Cancel immediately suppresses an upload flash even if the consumer has not unmounted yet", async () => {
  const a = deferred(); api.upload.mockReturnValueOnce(a.promise); const { onClose, onFlash } = mount(); choose("a.jpg");
  fireEvent.click(screen.getByRole("button", { name: "বাতিল" }));
  await act(async () => { a.resolve(success("a")); }); expect(onClose).toHaveBeenCalledOnce(); expect(onFlash).not.toHaveBeenCalled(); expect(screen.queryByAltText("Delivery proof photo")).not.toBeInTheDocument();
});
it("unmounted upload cannot flash into a reopened modal", async () => {
  const a = deferred(); api.upload.mockReturnValueOnce(a.promise); const old = mount(); choose("a.jpg"); old.unmount(); const current = mount(); code();
  await act(async () => { a.resolve(success("a")); }); expect(old.onFlash).not.toHaveBeenCalled(); expect(current.onFlash).not.toHaveBeenCalled(); expect(screen.queryByAltText("Delivery proof photo")).not.toBeInTheDocument();
});
it("keyed A → B → A replacement does not revive the old upload owner", async () => {
  const a = deferred(); api.upload.mockReturnValueOnce(a.promise); const props = { onSubmit: vi.fn(async () => null), onClose: vi.fn(), onFlash: vi.fn() };
  const { rerender } = render(<PinModal key="a" {...props} />); choose("a.jpg"); rerender(<PinModal key="b" {...props} />); rerender(<PinModal key="a" {...props} />);
  await act(async () => { a.resolve(success("a")); }); expect(props.onFlash).not.toHaveBeenCalled(); expect(screen.queryByAltText("Delivery proof photo")).not.toBeInTheDocument();
});
it("does not submit an already-attached old photo while its replacement is pending", async () => {
  api.upload.mockResolvedValueOnce(success("a")); const b = deferred(); api.upload.mockReturnValueOnce(b.promise); const { onSubmit } = mount(); code();
  await act(async () => { choose("a.jpg"); }); choose("b.jpg"); expect(submit()).toBeDisabled(); fireEvent.click(submit()); expect(onSubmit).not.toHaveBeenCalled();
  await act(async () => { b.resolve(success("b")); });
  await act(async () => { fireEvent.click(submit()); }); expect(onSubmit).toHaveBeenCalledExactlyOnceWith("1234", "https://img/b.jpg", null);
});
it("unexpected upload rejection is safe, unlocks, and allows explicit replacement", async () => {
  const a = deferred(); api.upload.mockReturnValueOnce(a.promise).mockResolvedValueOnce(success("retry")); mount(); code(); choose("a.jpg");
  await act(async () => { a.reject(new Error("Private transport detail")); });
  expect(screen.getByRole("alert")).toHaveTextContent("ছবি আপলোড হয়নি — আবার চেষ্টা করুন অথবা নিচে কারণ লিখুন।"); expect(submit()).toBeEnabled(); expect(screen.queryByText("Uploading to Cloudinary...")).not.toBeInTheDocument();
  await act(async () => { choose("retry.jpg"); }); expect(photo()).toHaveAttribute("src", "https://img/retry.jpg"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("stale unexpected upload rejection cannot disturb the newest successful proof", async () => {
  const a = deferred(), b = deferred(); api.upload.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); mount(); choose("a.jpg"); choose("b.jpg");
  await act(async () => { b.resolve(success("b")); }); await act(async () => { a.reject(new Error("Old private detail")); });
  expect(photo()).toHaveAttribute("src", "https://img/b.jpg"); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("late unexpected rejection after unmount is consumed without a flash", async () => {
  const a = deferred(); api.upload.mockReturnValueOnce(a.promise); const { unmount, onFlash } = mount(); choose("a.jpg"); unmount();
  await act(async () => { a.reject(new Error("Unmounted private detail")); }); expect(onFlash).not.toHaveBeenCalled();
});
it("a failed replacement retains the previously accepted proof, as before", async () => {
  api.upload.mockResolvedValueOnce(success("previous")).mockResolvedValueOnce({ ok: false, message: "Replacement failed" }); const { onSubmit } = mount(); code();
  await act(async () => { choose("previous.jpg"); }); await act(async () => { choose("replacement.jpg"); });
  expect(screen.getByRole("alert")).toHaveTextContent("Replacement failed"); expect(photo()).toHaveAttribute("src", "https://img/previous.jpg"); expect(submit()).toBeEnabled();
  await act(async () => { fireEvent.click(submit()); }); expect(onSubmit).toHaveBeenCalledExactlyOnceWith("1234", "https://img/previous.jpg", null);
});
