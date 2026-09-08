import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import DeliveryChecker from "../delivery-checker";
import { DELIVERY_ZONES } from "@/lib/catalog";

afterEach(cleanup);
describe("Delivery availability", () => {
  it("quotes the configured zone, not a universal ETA", () => {
    render(<DeliveryChecker />);
    fireEvent.change(screen.getByLabelText("Area or location"), {
      target: { value: DELIVERY_ZONES[0].areas[0].toLowerCase() },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /check availability/i }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      DELIVERY_ZONES[0].etaLabel,
    );
    fireEvent.change(screen.getByLabelText("Area or location"), {
      target: { value: "Unknown location" },
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.click(
      screen.getByRole("button", { name: /check availability/i }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("couldn’t confirm");
  });
});
