import { describe, expect, it } from "vitest";
import { customerNavHref, navHref, shopNavHref } from "../rider-maps";

describe("rider navigation links", () => {
  it("a geo pin wins and starts directions in two-wheeler mode", () => {
    expect(customerNavHref({ lat: 25.0658, lng: 91.3951, customer: { address: "x", area: "y" } })).toBe(
      "https://www.google.com/maps/dir/?api=1&travelmode=two-wheeler&destination=25.0658,91.3951",
    );
  });
  it("falls back to the written address, encoded", () => {
    const href = customerNavHref({ customer: { address: "House 12", area: "Hasan Nagar" } });
    expect(href).toContain("destination=");
    expect(href).toContain(encodeURIComponent("House 12, Hasan Nagar, Sunamganj"));
  });
  it("is null with neither pin nor address", () => {
    expect(navHref({}, ["", null, "  "])).toBeNull();
  });
  it("shop link needs an address", () => {
    expect(shopNavHref({ name: "Shop", address: "" })).toBeNull();
    expect(shopNavHref({ name: "Shop", address: "Market Road" })).toContain(encodeURIComponent("Market Road, Sunamganj"));
  });
});
