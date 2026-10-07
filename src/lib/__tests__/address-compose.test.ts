import { describe, expect, it } from "vitest";
import { composeFullAddress } from "../address-compose";

describe("composeFullAddress", () => {
  it("puts the landmark where a rider will read it", () => {
    const out = composeFullAddress({
      houseNo: "12/A",
      roadName: "College Road",
      landmark: "মসজিদের পাশে",
      address: "বড় তালা",
      para: "Boropara",
      upazila: "Sunamganj Sadar",
      district: "Sunamganj",
    });
    expect(out).toBe(
      "House: 12/A, Road: College Road, Landmark: মসজিদের পাশে, বড় তালা, Para: Boropara, Sunamganj Sadar, Sunamganj",
    );
  });

  it("carries the landmark even when there is no house number or road", () => {
    expect(
      composeFullAddress({
        landmark: "স্কুলের উল্টো দিকে",
        para: "Boropara",
        district: "Sunamganj",
      }),
    ).toBe("Landmark: স্কুলের উল্টো দিকে, Para: Boropara, Sunamganj");
  });

  it("skips blanks instead of leaving stray commas", () => {
    expect(
      composeFullAddress({ houseNo: "  ", landmark: "", para: "", district: "Sunamganj" }),
    ).toBe("Sunamganj");
  });

  it("keeps the map pin last, at five decimals", () => {
    expect(
      composeFullAddress({ district: "Sunamganj", pin: { lat: 25.06581, lng: 91.39502 } }),
    ).toBe("Sunamganj, Pin: 25.06581,91.39502");
  });
});
