import { describe, expect, it } from "vitest";
import { HOME_DEFAULTS, publicPromoCode, resolveSettings } from "../home-cms";

describe("homepage CMS (§31)", () => {
  it("resolves nothing to the shipped defaults", () => {
    expect(resolveSettings(undefined)).toBe(HOME_DEFAULTS);
    expect(resolveSettings(null)).toBe(HOME_DEFAULTS);
    expect(resolveSettings("nope")).toBe(HOME_DEFAULTS);
  });

  it("deep-merges partial saves over defaults", () => {
    const merged = resolveSettings({
      announcement: { text: "Eid delivery — all day Saturday" },
      hero: { title1: "Made for" },
      sections: { offers: false, brandStory: false },
    });
    expect(merged.announcement.text).toBe("Eid delivery — all day Saturday");
    expect(merged.announcement.enabled).toBe(true); // on by default (2026-09-20)
    expect(merged.promo).toEqual(HOME_DEFAULTS.promo); // absent → disabled, blank
    expect(merged.hero.title1).toBe("Made for");
    expect(merged.hero.title2).toBe(HOME_DEFAULTS.hero.title2);
    expect(merged.sections.offers).toBe(false);
    expect(merged.sections.hero).toBe(true);
    expect(merged.sections.collections).toBe(true);
    // Retired keys from older saves (featured, brandStory, brandJournal) are dropped.
    expect(Object.keys(merged.sections).sort()).toEqual([
      "bestSellers",
      "collections",
      "hero",
      "newArrivals",
      "offers",
      "recent",
      "stories",
      "trust",
    ]);
    // UX plan R3 rails default on for saves that predate them.
    expect(merged.sections.bestSellers).toBe(true);
    expect(merged.sections.newArrivals).toBe(true);
    // An explicit "off" from an older publish survives the new default.
    expect(resolveSettings({ announcement: { enabled: false } }).announcement.enabled).toBe(false);
    // defaults never mutate
    expect(HOME_DEFAULTS.announcement.text).not.toBe(
      "Eid delivery — all day Saturday",
    );
  });

  it("exposes the public promo code only when enabled and non-blank", () => {
    expect(publicPromoCode(HOME_DEFAULTS)).toBeNull();
    expect(
      publicPromoCode(resolveSettings({ promo: { enabled: true, code: " welcome 10 " } })),
    ).toBe("WELCOME10");
    expect(publicPromoCode(resolveSettings({ promo: { enabled: true, code: "  " } }))).toBeNull();
    expect(publicPromoCode(resolveSettings({ promo: { enabled: false, code: "EID" } }))).toBeNull();
  });
});
