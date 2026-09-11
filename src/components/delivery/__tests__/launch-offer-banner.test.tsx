import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LaunchOfferBanner from "../launch-offer-banner";

const mockFetch = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      }),
    ) as unknown as typeof fetch,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LaunchOfferBanner — প্রথম 1000 অর্ডারে ডেলিভারি ফ্রি", () => {
  it("shows the offer copy with the live X/1000 claimed counter", async () => {
    mockFetch({
      totalOrders: 123,
      limit: 1000,
      remaining: 877,
      minFreeTaka: 1000,
      enabled: true,
    });
    render(<LaunchOfferBanner />);

    const banner = await screen.findByTestId("launch-offer-banner");
    expect(banner).toHaveTextContent("প্রথম 1000 অর্ডারে ডেলিভারি ফ্রি!");
    await screen.findByText("123/1000");
    expect(banner).toHaveTextContent("877");
    expect(banner).toHaveTextContent("এখন অর্ডার করলে ফ্রি পাবেন!");
    // zone prices + the ৳1000+ always-free line
    expect(banner).toHaveTextContent(
      "Zone A ৳30 · Zone B ৳50 · Zone C ৳70 · বাইরে ৳100",
    );
    expect(banner).toHaveTextContent("৳1000+ অর্ডারে সবসময় ফ্রি");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "1000",
    );
  });

  it("hides itself once all 1000 slots are claimed", async () => {
    mockFetch({
      totalOrders: 1000,
      limit: 1000,
      remaining: 0,
      minFreeTaka: 1000,
      enabled: false,
    });
    render(<LaunchOfferBanner />);
    await vi.waitFor(() => {
      expect(screen.queryByTestId("launch-offer-banner")).not.toBeInTheDocument();
    });
  });
});
