import { describe, expect, it } from "vitest";
import {
  FabricInputError,
  gsmBand,
  hasFabricInfo,
  parseFabricTransparency,
} from "../fabric";

describe("parseFabricTransparency — P2 #21 quality card", () => {
  it("treats blank input as 'nothing declared', never as a claim", () => {
    expect(parseFabricTransparency({})).toEqual({
      gsm: null,
      manufacturer: null,
      reportUrl: null,
      qualityChecked: false,
    });
    expect(
      parseFabricTransparency({
        fabricGsm: "",
        manufacturer: "   ",
        testReportUrl: "",
        qualityChecked: false,
      }),
    ).toEqual({ gsm: null, manufacturer: null, reportUrl: null, qualityChecked: false });
  });

  it("accepts a full honest declaration", () => {
    expect(
      parseFabricTransparency({
        fabricGsm: 160,
        manufacturer: " Nizam   Textiles ",
        testReportUrl: "https://drive.google.com/file/d/abc/view",
        qualityChecked: true,
      }),
    ).toEqual({
      gsm: 160,
      manufacturer: "Nizam Textiles",
      reportUrl: "https://drive.google.com/file/d/abc/view",
      qualityChecked: true,
    });
  });

  it("rejects nonsense GSM but allows real fabric range edges", () => {
    expect(() => parseFabricTransparency({ fabricGsm: 5 })).toThrow(FabricInputError);
    expect(() => parseFabricTransparency({ fabricGsm: 1001 })).toThrow(FabricInputError);
    expect(() => parseFabricTransparency({ fabricGsm: 160.5 })).toThrow(FabricInputError);
    expect(() => parseFabricTransparency({ fabricGsm: "cheap" })).toThrow(FabricInputError);
    expect(parseFabricTransparency({ fabricGsm: 30 }).gsm).toBe(30);
    expect(parseFabricTransparency({ fabricGsm: 1000 }).gsm).toBe(1000);
  });

  it("only accepts a real http(s) link for the test report", () => {
    expect(() => parseFabricTransparency({ testReportUrl: "javascript:alert(1)" })).toThrow(
      FabricInputError,
    );
    expect(() => parseFabricTransparency({ testReportUrl: "drive:///abc" })).toThrow(
      FabricInputError,
    );
    expect(
      parseFabricTransparency({ testReportUrl: "http://lab.example.bd/report.pdf" }).reportUrl,
    ).toBe("http://lab.example.bd/report.pdf");
  });

  it("caps the manufacturer name and collapses runs of whitespace", () => {
    expect(() =>
      parseFabricTransparency({ manufacturer: "A".repeat(200) }),
    ).toThrow(FabricInputError);
    expect(
      parseFabricTransparency({ manufacturer: "  Tangail \n Jamdani   Weavers  " }).manufacturer,
    ).toBe("Tangail Jamdani Weavers");
  });

  it("treats only strict true as quality-checked (no truthy coercion)", () => {
    expect(parseFabricTransparency({ qualityChecked: "yes" }).qualityChecked).toBe(false);
    expect(parseFabricTransparency({ qualityChecked: 1 }).qualityChecked).toBe(false);
    expect(parseFabricTransparency({ qualityChecked: true }).qualityChecked).toBe(true);
  });
});

describe("hasFabricInfo / gsmBand", () => {
  it("renders nothing at all when no field is declared", () => {
    expect(hasFabricInfo({})).toBe(false);
    expect(hasFabricInfo({ gsm: null, qualityChecked: false })).toBe(false);
    expect(hasFabricInfo({ qualityChecked: true })).toBe(true);
    expect(hasFabricInfo({ gsm: 160 })).toBe(true);
    expect(hasFabricInfo({ manufacturer: "Nizam Textiles" })).toBe(true);
  });

  it("bands real fabric weights", () => {
    expect(gsmBand(90)).toBe("light");
    expect(gsmBand(110)).toBe("light");
    expect(gsmBand(150)).toBe("mid-weight");
    expect(gsmBand(200)).toBe("heavy");
    expect(gsmBand(400)).toBe("extra-heavy");
  });
});
