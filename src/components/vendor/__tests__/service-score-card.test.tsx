/**
 * A2 — the vendor service-score card (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 * The maths is unit-tested in src/lib/__tests__/vendor-dashboard.test.ts; this
 * file asserts what the shop owner actually reads, including the honest
 * "nothing to score yet" state.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ServiceScoreCard from "@/components/vendor/service-score-card";
import type { ServiceScore } from "@/lib/vendor-dashboard";

const score = (over: Partial<ServiceScore> = {}): ServiceScore => ({
  windowDays: 7,
  placed: 0,
  cancelled: 0,
  fulfilmentRate: null,
  dispatched: 0,
  medianDispatchMinutes: null,
  onTimeRate: null,
  returns: 0,
  refunded: 0,
  ...over,
});

afterEach(cleanup);

describe("<ServiceScoreCard>", () => {
  it("says there is nothing to score instead of showing fake zeros", () => {
    render(<ServiceScoreCard score={score()} prepMinutes={20} />);
    expect(screen.getByTestId("service-empty").textContent).toContain("nothing to score yet");
    expect(screen.queryByTestId("service-fulfilment")).toBeNull();
  });

  it("shows the week's numbers with the shop's own promise as the yardstick", () => {
    render(
      <ServiceScoreCard
        score={score({
          placed: 12,
          cancelled: 1,
          fulfilmentRate: 11 / 12,
          dispatched: 10,
          medianDispatchMinutes: 24,
          onTimeRate: 0.7,
        })}
        prepMinutes={30}
      />,
    );
    expect(screen.getByTestId("service-fulfilment").textContent).toBe("92%");
    expect(screen.getByText(/12 placed · 1 cancelled/)).toBeInTheDocument();
    expect(screen.getByTestId("service-dispatch").textContent).toBe("24 min");
    expect(screen.getByText("10 handed to a rider")).toBeInTheDocument();
    expect(screen.getByTestId("service-ontime").textContent).toBe("70%");
    expect(screen.getByText("promise: 30 min")).toBeInTheDocument();
  });

  it("asks for a prep time instead of scoring on-time when the shop never set one", () => {
    render(
      <ServiceScoreCard
        score={score({ placed: 4, dispatched: 3, medianDispatchMinutes: 12 })}
        prepMinutes={0}
      />,
    );
    expect(screen.getByTestId("service-ontime").textContent).toBe("—");
    const link = screen.getByRole("link", { name: "Set a prep time" });
    expect(link).toHaveAttribute("href", "/vendor/settings");
  });

  it("mentions returns and refunds only when there are any", () => {
    render(<ServiceScoreCard score={score({ placed: 9 })} prepMinutes={15} />);
    expect(screen.queryByTestId("service-returns")).toBeNull();
    cleanup();
    render(
      <ServiceScoreCard
        score={score({ placed: 9, returns: 2, refunded: 1 })}
        prepMinutes={15}
      />,
    );
    expect(screen.getByTestId("service-returns").textContent).toContain("Returns: 2 · 1 refunded");
  });
});
