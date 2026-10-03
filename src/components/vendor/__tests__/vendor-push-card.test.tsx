import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-vendor-push", () => ({ useVendorPush: () => state.hook }));

import { VendorPushCard } from "../vendor-push-card";

const base = (over: Record<string, unknown> = {}) => ({
  phase: "off", busy: false, error: null, blocker: null, steps: [],
  enable: vi.fn(async () => true), disable: vi.fn(async () => {}), ...over,
});

afterEach(cleanup);

describe("<VendorPushCard>", () => {
  it("off: explains why and turns on with one tap", () => {
    const enable = vi.fn(async () => true);
    state.hook = base({ enable });
    render(<VendorPushCard enabled />);
    expect(screen.getByTestId("vendor-push-card")).toHaveTextContent("even with the panel closed");
    fireEvent.click(screen.getByRole("button", { name: "Turn on notifications" }));
    expect(enable).toHaveBeenCalledTimes(1);
  });

  it("on: one quiet line with an off switch", () => {
    const disable = vi.fn(async () => {});
    state.hook = base({ phase: "on", disable });
    render(<VendorPushCard enabled />);
    expect(screen.getByTestId("vendor-push-on")).toBeInTheDocument();
    expect(screen.queryByTestId("vendor-push-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(disable).toHaveBeenCalledTimes(1);
  });

  it("denied shows steps and no enable button; blocked names the blocker", () => {
    state.hook = base({ phase: "denied", steps: ["Battery → Unrestricted"] });
    const { rerender } = render(<VendorPushCard enabled />);
    expect(screen.getByText("Battery → Unrestricted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turn on/ })).toBeNull();
    state.hook = base({ phase: "blocked", blocker: "Open it in Chrome.", error: "failed" });
    rerender(<VendorPushCard enabled />);
    expect(screen.getByRole("note")).toHaveTextContent("Open it in Chrome.");
    expect(screen.getByRole("alert")).toHaveTextContent("failed");
  });

  it("renders nothing while probing or when the server has no push", () => {
    state.hook = base({ phase: "loading" });
    const { container, rerender } = render(<VendorPushCard enabled />);
    expect(container).toBeEmptyDOMElement();
    state.hook = base({ phase: "off-server" });
    rerender(<VendorPushCard enabled />);
    expect(container).toBeEmptyDOMElement();
  });
});
