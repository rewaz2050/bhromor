import { afterEach, describe, it, expect } from "vitest";
import type React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import DeliveryChecker from "../delivery-checker";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { DELIVERY_ZONES } from "@/lib/catalog";

afterEach(cleanup);

const renderBn = (ui: React.ReactElement) =>
  render(<LanguageProvider initialLang="bn">{ui}</LanguageProvider>);
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

  it("renders Bangla copy under the bn language", () => {
    renderBn(<DeliveryChecker />);
    expect(screen.getByLabelText("এলাকা বা ঠিকানা")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("এলাকা বা ঠিকানা"), {
      target: { value: "Unknown location" },
    });
    fireEvent.click(screen.getByRole("button", { name: "পাওয়া যায় কি না দেখুন" }));
    expect(screen.getByRole("status")).toHaveTextContent("এই এলাকা নিশ্চিত করা যায়নি");
  });
});
