/**
 * The error screen every surface now falls back to (scan 2026-10-08).
 *
 * Before this only `/admin` had a boundary: a thrown server error on the
 * storefront, in the rider app or in the vendor app replaced the page with
 * Next's bare "Application error" screen — no chrome, no way back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorState from "@/components/ui/error-state";

afterEach(cleanup);

describe("<ErrorState>", () => {
  it("says what happened in both languages and offers a way out", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("This page could not load")).toBeTruthy();
    expect(screen.getByText("এই পাতাটি লোড হয়নি")).toBeTruthy();
    // A dead end is not a recovery — there is always somewhere to go.
    expect(screen.getByRole("link", { name: /Back to the shop/ })).toHaveAttribute("href", "/");
  });

  it("reassures the shopper that nothing was lost", () => {
    render(<ErrorState />);
    expect(screen.getByText(/Your bag and your orders are safe/)).toBeTruthy();
  });

  it("retries the failed segment when asked", () => {
    const reset = vi.fn();
    render(<ErrorState onRetry={reset} />);
    screen.getByRole("button", { name: /Try again/ }).click();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the error digest so support can find the log line", () => {
    render(<ErrorState error={Object.assign(new Error("boom"), { digest: "abc123" })} />);
    expect(screen.getByText(/abc123/)).toBeTruthy();
  });

  it("names the surface it is covering — a rider's way home is their jobs", () => {
    render(
      <ErrorState
        title="The rider board could not load"
        titleBn="রাইডার বোর্ড লোড হয়নি"
        homeHref="/rider"
        homeLabel="Back to my jobs"
        homeLabelBn="আমার কাজে ফিরুন"
      />,
    );
    expect(screen.getByText("The rider board could not load")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to my jobs/ })).toHaveAttribute("href", "/rider");
  });
});
