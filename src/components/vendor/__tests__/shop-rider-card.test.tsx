/** Audit H — the shop sees who is coming for the parcel and can call them. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ShopRiderCard from "../shop-rider-card";

afterEach(cleanup);

describe("<ShopRiderCard>", () => {
  it("renders nothing when no rider is on the job", () => {
    const { container } = render(<ShopRiderCard rider={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the name and a tel: link while the rider is on the way to the shop", () => {
    render(<ShopRiderCard rider={{ name: "Rahim", phone: "01712345678", vehicle: "bike", state: "accepted" }} />);
    expect(screen.getByText(/Rahim/)).toBeTruthy();
    expect(screen.getByTestId("vendor-rider-state").textContent).toMatch(/রেডি রাখুন/);
    expect(screen.getByTestId("vendor-rider-call").getAttribute("href")).toBe("tel:01712345678");
  });

  it("says the parcel is on its way once picked up", () => {
    render(<ShopRiderCard rider={{ name: "Rahim", phone: "01712345678", vehicle: "bicycle", state: "picked_up" }} />);
    expect(screen.getByTestId("vendor-rider-state").textContent).toMatch(/নিয়ে গেছে/);
  });
});
