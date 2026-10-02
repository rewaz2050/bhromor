import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-rider-push", () => ({ useRiderPush: () => state.hook }));

import { RiderPushCard } from "../rider-push-card";

const base = (over: Record<string, unknown> = {}) => ({
  phase: "off", busy: false, error: null, blocker: null, steps: [],
  enable: vi.fn(async () => true), disable: vi.fn(async () => {}), ...over,
});

afterEach(cleanup);

describe("<RiderPushCard>", () => {
  it("off: explains why and turns on with one tap", () => {
    const enable = vi.fn(async () => true);
    state.hook = base({ enable });
    render(<RiderPushCard enabled />);
    expect(screen.getByTestId("rider-push-card")).toHaveTextContent("৯০ সেকেন্ড");
    fireEvent.click(screen.getByRole("button", { name: "নোটিফিকেশন চালু করুন" }));
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("on: one quiet line with an off switch", () => {
    const disable = vi.fn(async () => {});
    state.hook = base({ phase: "on", disable });
    render(<RiderPushCard enabled />);
    expect(screen.getByTestId("rider-push-on")).toBeInTheDocument();
    expect(screen.queryByTestId("rider-push-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "বন্ধ করুন" }));
    expect(disable).toHaveBeenCalledTimes(1);
  });

  it("denied: shows the recovery steps and no enable button", () => {
    state.hook = base({ phase: "denied", steps: ["Chrome-এ 🔒 চাপুন", "Battery → Unrestricted"] });
    render(<RiderPushCard enabled />);
    expect(screen.getByText(/ব্লক করা আছে/)).toBeInTheDocument();
    expect(screen.getByText("Battery → Unrestricted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /চালু করুন/ })).toBeNull();
  });

  it("blocked: names the blocker; an error shows as an alert", () => {
    state.hook = base({ phase: "blocked", blocker: "Chrome-এ খুলুন।", error: "ব্যর্থ" });
    render(<RiderPushCard enabled />);
    expect(screen.getByRole("note")).toHaveTextContent("Chrome-এ খুলুন।");
    expect(screen.getByRole("alert")).toHaveTextContent("ব্যর্থ");
  });

  it("renders nothing while probing, or when the office has not set push up", () => {
    state.hook = base({ phase: "loading" });
    const { container, rerender } = render(<RiderPushCard enabled />);
    expect(container).toBeEmptyDOMElement();
    state.hook = base({ phase: "off-server" });
    rerender(<RiderPushCard enabled />);
    expect(container).toBeEmptyDOMElement();
  });
});
