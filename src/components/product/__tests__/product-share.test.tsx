import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProductShare from "@/components/product/product-share";
import { PRODUCTS } from "@/lib/catalog";
import { __resetToast, getToast } from "@/lib/toast";

const product = PRODUCTS[0];

beforeEach(() => {
  __resetToast();
});
afterEach(() => {
  cleanup();
  __resetToast();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProductShare", () => {
  it("offers a WhatsApp share whose text carries the name, the price and the link", () => {
    render(<ProductShare product={product} />);
    const wa = screen.getByRole("link", { name: /whatsapp/i });
    const href = decodeURIComponent(wa.getAttribute("href") ?? "");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(href).toContain(product.name);
    expect(href).toContain(`/product/${product.slug}`);
    expect(href).toContain("৳");
    expect(wa).toHaveAttribute("target", "_blank");
    expect(wa).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("copies the link and says so with a toast, not an alert", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    render(<ProductShare product={product} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(`/product/${product.slug}`);
    expect(getToast()?.message).toMatch(/copied/i);
    expect(getToast()?.tone).toBe("success");
  });

  it("warns instead of pretending when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    render(<ProductShare product={product} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    });
    expect(getToast()?.tone).toBe("warn");
  });

  it("uses the OS share sheet when the device has one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    render(<ProductShare product={product} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^share$/i }));
    });
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].url).toContain(`/product/${product.slug}`);
  });

  it("hides the OS button on devices without it (desktop, older Android)", () => {
    vi.stubGlobal("navigator", { ...navigator, share: undefined });
    render(<ProductShare product={product} />);
    // Only WhatsApp + copy link remain — no button that does nothing.
    expect(screen.queryByRole("button", { name: /^share$/i })).toBeNull();
    expect(screen.getByRole("link", { name: /whatsapp/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy link/i }),
    ).toBeInTheDocument();
  });
});
