import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LicenceBanner } from "../licence-banner";

const NOW = Date.parse("2026-10-02T06:00:00.000Z");

describe("LicenceBanner", () => {
  it("is silent for a bicycle, an unrecorded date and a valid licence", () => {
    const { container, rerender } = render(<LicenceBanner vehicle="bicycle" expiresOn="2020-01-01" nowMs={NOW} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LicenceBanner vehicle="bike" expiresOn={null} nowMs={NOW} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LicenceBanner vehicle="bike" expiresOn="2027-10-02" nowMs={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns amber when it is about to lapse", () => {
    render(<LicenceBanner vehicle="bike" expiresOn="2026-10-09" nowMs={NOW} />);
    const el = screen.getByTestId("licence-banner");
    expect(el).toHaveAttribute("data-kind", "soon");
    expect(el).toHaveTextContent("7 দিন");
  });

  it("alerts red once lapsed and says why they cannot go online", () => {
    render(<LicenceBanner vehicle="scooter" expiresOn="2026-09-01" nowMs={NOW} />);
    expect(screen.getByRole("alert")).toHaveTextContent("অনলাইন হওয়া যাবে না");
  });
});
