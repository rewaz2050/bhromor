/** UX plan §1.1 (R9) — colour names become dots only when we can render them honestly. */
import { describe, expect, it } from "vitest";
import { swatchBackground, swatchColors } from "../color-swatch";

describe("colour swatches", () => {
  it("resolves single colours in English and Bengali", () => {
    expect(swatchColors("Forest Green")).toEqual(["#1f4d36"]);
    expect(swatchColors("Ivory")).toEqual(["#f3ead8"]);
    expect(swatchColors("সবুজ")).toEqual(["#2f7a4a"]);
    expect(swatchBackground("Slate")).toBe("#8d949c");
  });

  it("turns a two-colour name into stripes, in the order the words appear", () => {
    expect(swatchColors("Red & Cream")).toEqual(["#c62828", "#f3ead8"]);
    expect(swatchBackground("Red & Cream")).toMatch(/^linear-gradient\(135deg, #c62828 0% 50%, #f3ead8 50% 100%\)$/);
    expect(swatchColors("Deep Teal Check")).toEqual(["#1f6f78"]);
  });

  it("answers null for a name it cannot place instead of guessing", () => {
    expect(swatchBackground("Heritage")).toBeNull();
    expect(swatchBackground("")).toBeNull();
  });
});
