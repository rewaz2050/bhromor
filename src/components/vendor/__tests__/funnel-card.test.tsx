/**
 * B4 (2026-09-28) — the funnel card as the shop reads it.
 *
 * What is being protected: a small number must not be shown as a confident
 * rate, "no data yet" must not look like "you are doing badly", and the
 * migration-not-installed state must be stated as such rather than printed as
 * an empty shop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FunnelCard from "@/components/vendor/funnel-card";
import { emptyShopFunnel, type ShopFunnel } from "@/lib/shop-funnel";

afterEach(cleanup);

const funnel = (over: Partial<ShopFunnel> = {}): ShopFunnel => ({
  days: 7,
  shopId: "s1",
  sessions: 400,
  pageViews: 520,
  pdpSessions: 200,
  addToCartSessions: 80,
  checkoutSessions: 40,
  purchaseSessions: 25,
  orders: 30,
  revenue: 4_500_000,
  aov: 150_000,
  units: 44,
  atcBySource: [{ source: "pdp", count: 50 }, { source: "card", count: 30 }],
  topProducts: [
    { productId: "p1", name: "Saree", slug: "saree-1", views: 120, adds: 40, orders: 18 },
    { productId: "p2", name: "Panjabi", views: 80, adds: 10, orders: 1 },
  ],
  ...over,
});

describe("FunnelCard (B4)", () => {
  it("shows the steps as people, with the rates beside them", () => {
    render(<FunnelCard funnel={funnel()} />);
    expect(screen.getByTestId("funnel-totals")).toHaveTextContent("400");
    expect(screen.getByTestId("funnel-totals")).toHaveTextContent("30");
    const steps = screen.getByTestId("funnel-steps");
    expect(steps.querySelectorAll("li")).toHaveLength(4);
    expect(screen.getByTestId("funnel-step-viewRate")).toHaveTextContent("200 of 400 · 50%");
    expect(screen.getByTestId("funnel-step-addRate")).toHaveTextContent("80 of 200 · 40%");
    expect(screen.getByTestId("funnel-step-checkoutRate")).toHaveTextContent("40 of 80 · 50%");
    expect(screen.getByTestId("funnel-step-orderRate")).toHaveTextContent("30 of 40 · 75%");
  });

  it("refuses to print a rate on a thin step", () => {
    render(
      <FunnelCard
        funnel={funnel({ sessions: 120, pdpSessions: 8, addToCartSessions: 4, checkoutSessions: 2, orders: 1 })}
      />,
    );
    const thin = screen.getByTestId("funnel-step-addRate");
    expect(thin).toHaveTextContent("Not enough data yet");
    expect(thin).toHaveTextContent("4 of 8");
    expect(thin.textContent).not.toContain("50%");
    // The first step has a big enough base and still shows its rate.
    expect(screen.getByTestId("funnel-step-viewRate").textContent).toContain("%");
  });

  it("says there is no data yet instead of showing a dead shop", () => {
    render(<FunnelCard funnel={emptyShopFunnel(7)} />);
    expect(screen.getByTestId("funnel-quiet")).toHaveTextContent("No visitors recorded yet");
    expect(screen.queryByTestId("funnel-steps")).toBeNull();
  });

  it("names the migration when it has not been run", () => {
    render(<FunnelCard funnel={null} missing />);
    const card = screen.getByTestId("funnel-missing");
    expect(card).toHaveTextContent("202609280004_shop_funnel.sql");
    expect(card).toHaveTextContent("Not switched on yet");
  });

  it("shows a loading skeleton and offers a retry on a real error", () => {
    const onRetry = vi.fn();
    render(<FunnelCard funnel={null} loading />);
    expect(screen.getByLabelText("Loading")).toBeTruthy();

    cleanup();
    render(<FunnelCard funnel={null} error="Could not reach the server." onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("opens the per-product table and the add-to-bag sources", () => {
    render(<FunnelCard funnel={funnel()} />);
    expect(screen.queryByTestId("funnel-products")).toBeNull();
    fireEvent.click(screen.getByTestId("funnel-detail-toggle"));

    const table = screen.getByTestId("funnel-products");
    expect(table).toHaveTextContent("Saree");
    expect(table).toHaveTextContent("18");
    expect(screen.getByTestId("funnel-sources")).toHaveTextContent("Product page: 50");
    expect(screen.getByTestId("funnel-sources")).toHaveTextContent("Card quick-add: 30");
  });

  it("switches the window when the toggle is offered", () => {
    const onDays = vi.fn();
    render(<FunnelCard funnel={funnel({ days: 28 })} days={7} onDays={onDays} />);
    fireEvent.click(screen.getByRole("button", { name: "28 days" }));
    expect(onDays).toHaveBeenCalledWith(28);
    expect(screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps AOV honest when there were no orders", () => {
    render(<FunnelCard funnel={funnel({ orders: 0, revenue: 0, aov: null, units: 0 })} />);
    expect(screen.getByTestId("funnel-money")).toHaveTextContent("—");
  });
});
