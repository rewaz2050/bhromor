import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DeliveryEstimate from "../delivery-estimate";

const state = vi.hoisted(() => ({ lang: "en", zoneId: "" }));
vi.mock("@/components/i18n/language-provider", () => ({ useLanguage: () => ({ lang: state.lang }) }));
vi.mock("@/lib/use-my-zone", () => ({ useMyZone: () => ({ zoneId: state.zoneId }) }));
vi.mock("@/lib/use-live-zones", () => ({
  useLiveZones: () => ({ activeZones: [
    { id: "z1", name: "Town — Centre", etaLabel: "30–40 min" },
    { id: "z3", name: "Outer", etaLabel: "50–60 min" },
    { id: "z4", name: "Courier", etaLabel: "45–50 min" },
  ] }),
}));
afterEach(() => { cleanup(); state.lang = "en"; state.zoneId = ""; });
describe("DeliveryEstimate", () => {
  it("does not promise a time before an active area is selected", () => {
    const { rerender } = render(<DeliveryEstimate />);
    expect(screen.getByText("Choose your area for a delivery estimate")).toBeInTheDocument();
    state.zoneId = "disabled-or-removed";
    rerender(<DeliveryEstimate />);
    expect(screen.getByText("Choose your area for a delivery estimate")).toBeInTheDocument();
  });
  it("uses the selected area's ETA, not a blanket promise", () => {
    state.zoneId = "z3";
    render(<DeliveryEstimate />);
    expect(screen.getByText("Outer · 50–60 min")).toBeInTheDocument();
  });
  it("uses courier days even if a rider ETA was configured", () => {
    state.zoneId = "z4";
    render(<DeliveryEstimate />);
    expect(screen.getByText(/Courier · 1–3/)).toBeInTheDocument();
    expect(screen.queryByText(/45–50/)).not.toBeInTheDocument();
  });
  it("localizes the prompt and numeric ETA in Bengali", () => {
    state.lang = "bn";
    const { rerender } = render(<DeliveryEstimate />);
    expect(screen.getByText("এলাকা বেছে ডেলিভারির সময় দেখুন")).toBeInTheDocument();
    state.zoneId = "z1";
    rerender(<DeliveryEstimate />);
    expect(screen.getByText("Town · ৩০–৪০ min")).toBeInTheDocument();
  });
});
