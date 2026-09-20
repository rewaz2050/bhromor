import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PromoCodeCard from "@/components/home/promo-code-card";
import { HOME_DEFAULTS } from "@/lib/home-cms";
import { __resetHomeSettings } from "@/lib/use-home-settings";

const originalFetch = globalThis.fetch;
let settings: unknown = HOME_DEFAULTS;

beforeEach(() => {
  __resetHomeSettings();
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ settings }), { status: 200 }))) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("PromoCodeCard", () => {
  it("renders nothing unless the CMS switched a code on", async () => {
    settings = HOME_DEFAULTS;
    const { container } = render(<PromoCodeCard />);
    await flush();
    expect(container).toBeEmptyDOMElement();

    cleanup();
    __resetHomeSettings();
    // Enabled but blank code → still nothing (never an empty dashed box).
    settings = { ...HOME_DEFAULTS, promo: { enabled: true, code: "   ", text: "10% off" } };
    const second = render(<PromoCodeCard />);
    await flush();
    expect(second.container).toBeEmptyDOMElement();
  });

  it("shows the code with its line and copies it on tap", async () => {
    settings = {
      ...HOME_DEFAULTS,
      promo: { enabled: true, code: "welcome 10", text: "10% off your first order · min ৳999" },
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PromoCodeCard />);
    const card = await screen.findByTestId("promo-code-card");
    expect(card).toHaveTextContent("10% off your first order");
    // normalised the way checkout matches it
    const btn = screen.getByTestId("promo-code-copy");
    expect(btn).toHaveTextContent("WELCOME10");
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("WELCOME10"));
    expect(screen.getByRole("status")).toHaveTextContent(/code copied/i);
    expect(screen.getByRole("link", { name: /shop now/i })).toHaveAttribute("href", "/shop");
  });
});
