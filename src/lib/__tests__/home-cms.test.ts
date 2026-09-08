import { describe, expect, it } from "vitest";
import { HOME_DEFAULTS, resolveSettings } from "../home-cms";

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
      sections: { brandStory: false },
    });
    expect(merged.announcement.text).toBe("Eid delivery — all day Saturday");
    expect(merged.announcement.enabled).toBe(true); // default survives
    expect(merged.hero.title1).toBe("Made for");
    expect(merged.hero.title2).toBe(HOME_DEFAULTS.hero.title2);
    expect(merged.sections.brandStory).toBe(false);
    expect(merged.sections.hero).toBe(true);
    // defaults never mutate
    expect(HOME_DEFAULTS.announcement.text).not.toBe(
      "Eid delivery — all day Saturday",
    );
  });
});
