import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareRow from "@/components/product/share-row";
import { PRODUCTS } from "@/lib/catalog";

const product = PRODUCTS[0];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareRow", () => {
  it("offers WhatsApp, Facebook and copy-link for the current page", async () => {
    render(<ShareRow product={product} />);
    const wa = screen.getByTestId("share-whatsapp");
    expect(wa).toHaveAttribute("target", "_blank");
    const waText = decodeURIComponent(wa.getAttribute("href") ?? "");
    expect(waText).toContain(product.name);
    expect(waText).toContain(`/product/${product.slug}`);
    expect(waText).toContain("utm_source=whatsapp");

    const fb = screen.getByTestId("share-facebook").getAttribute("href") ?? "";
    expect(fb.startsWith("https://www.facebook.com/sharer/sharer.php?u=")).toBe(true);
    expect(decodeURIComponent(fb)).toContain("utm_source=facebook");

    // No Web Share API in jsdom → no native button, no dead control.
    expect(screen.queryByTestId("share-native")).toBeNull();
  });

  it("copies the link and confirms; says so honestly when the clipboard is blocked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<ShareRow product={product} />);
    fireEvent.click(screen.getByTestId("share-copy"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/link copied/i));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("utm_source=copy");

    cleanup();
    writeText.mockRejectedValueOnce(new Error("blocked"));
    render(<ShareRow product={product} />);
    fireEvent.click(screen.getByTestId("share-copy"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/couldn't copy/i),
    );
  });

  it("shows the device share sheet button when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ShareRow product={product} />);
    const btn = await screen.findByTestId("share-native");
    fireEvent.click(btn);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0]).toMatchObject({ title: product.name });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
});
