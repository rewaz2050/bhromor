import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareLink from "../share-link";
const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const share = vi.fn(); const writeText = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(() => {
  cleanup();
  if (shareDescriptor) Object.defineProperty(navigator, "share", shareDescriptor); else Reflect.deleteProperty(navigator, "share");
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor); else Reflect.deleteProperty(navigator, "clipboard");
});
const mount = () => render(<ShareLink text="Wishlist" url="https://example.test/wishlist?ids=one" label="Share list" copiedLabel="Link copied" />);
describe("shared-link recovery", () => {
  it("keeps the WhatsApp link when native sharing is unsupported", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    mount();
    expect(screen.getByRole("link", { name: "Share list" })).toHaveAttribute("href", expect.stringContaining("https://wa.me/"));
    expect(writeText).not.toHaveBeenCalled();
  });
  it("does not copy after native sharing succeeds", async () => {
    share.mockResolvedValue(undefined); mount();
    fireEvent.click(screen.getByRole("link", { name: "Share list" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(writeText).not.toHaveBeenCalled();
  });
  it("does not copy a URL when the user cancels sharing", async () => {
    share.mockRejectedValue(new DOMException("Canceled", "AbortError"));
    mount(); fireEvent.click(screen.getByRole("link", { name: "Share list" }));
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });
  it.each(["rejected", "synchronous"])("reports a successful copy after a %s sharing failure", async kind => {
    if (kind === "synchronous") share.mockImplementation(() => { throw new Error("Unavailable"); });
    else share.mockRejectedValue(new Error("Unavailable"));
    writeText.mockResolvedValue(undefined);
    mount(); fireEvent.click(screen.getByRole("link", { name: "Share list" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Link copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith("https://example.test/wishlist?ids=one");
  });
  it("does not claim a blocked copy worked and leaves a real WhatsApp fallback", async () => {
    share.mockRejectedValue(new Error("Unavailable")); writeText.mockRejectedValue(new Error("Blocked"));
    mount(); const link = screen.getByRole("link", { name: "Share list" }); fireEvent.click(link);
    await screen.findByText(/Tap Share again to open WhatsApp/);
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/"));
    link.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(share).toHaveBeenCalledOnce();
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });
});
