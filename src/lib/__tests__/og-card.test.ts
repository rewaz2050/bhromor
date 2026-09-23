import { describe, expect, it } from "vitest";
import {
  OG_TAGLINE,
  ogDescriptionFor,
  ogFitTitle,
  ogGridPicks,
  ogHostname,
  ogTaka,
} from "../og-card";

describe("og-card — share preview copy rules", () => {
  it("writes taka as Tk with Indian digit grouping (no ৳ — the card font has no Bengali glyphs)", () => {
    expect(ogTaka(0)).toBe("Tk 0");
    expect(ogTaka(149000)).toBe("Tk 1,490");
    expect(ogTaka(1290000)).toBe("Tk 12,900");
  });

  it("keeps titles to two lines — short ones stay at 56px, long ones step to 44px with an ellipsis", () => {
    expect(ogFitTitle("Heritage Green Panjabi")).toEqual({
      text: "Heritage Green Panjabi",
      size: 56,
    });
    const long = ogFitTitle(
      "Ivory Chikankari Three-piece With Hand Embroidered Dupatta Edition",
    );
    expect(long.size).toBe(44);
    expect(long.text.endsWith("…")).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(40);
    expect(long.text).not.toMatch(/\s…$/);
  });

  it("falls back to the brand name when a title would be empty", () => {
    expect(ogFitTitle("   ")).toEqual({ text: "PROSANTI", size: 56 });
  });

  it("cuts descriptions on a word boundary", () => {
    const text = "Handloom cotton panjabi with karchupi collar and matching pajama";
    expect(ogDescriptionFor(text)).toBe(text);
    const long = ogDescriptionFor("a ".repeat(80), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("repeats the same promise on every card footer", () => {
    expect(OG_TAGLINE).toContain("Cash on delivery");
    expect(OG_TAGLINE).toContain("Sunamganj");
  });

  it("strips the host to a bare display name", () => {
    expect(ogHostname("https://proshanti.rahatahmed.site")).toBe(
      "proshanti.rahatahmed.site",
    );
    expect(ogHostname("https://www.prosanti.store/path")).toBe("prosanti.store");
    expect(ogHostname("not-a-url")).toBe("not-a-url");
  });

  it("picks up to three real covers for the shop card — in-stock first, image slides only, no repeats", () => {
    const products = [
      {
        slug: "sold-out",
        inStock: false,
        media: [{ src: "/images/sold.jpg", alt: "sold" }],
      },
      {
        slug: "a",
        inStock: true,
        media: [
          { src: "/images/a.jpg", alt: "a" },
          { src: "/videos/a.mp4", alt: "", kind: "video" as const },
        ],
      },
      {
        slug: "b",
        inStock: true,
        media: [{ src: "/images/b.jpg", alt: "b" }],
      },
      {
        slug: "no-media",
        inStock: true,
        media: [],
      },
      {
        slug: "c",
        inStock: true,
        media: [{ src: "/images/c.jpg", alt: "c" }],
      },
    ];
    const picks = ogGridPicks(products);
    expect(picks.map((p) => p.src)).toEqual([
      "/images/a.jpg",
      "/images/b.jpg",
      "/images/c.jpg",
    ]);
  });
});
