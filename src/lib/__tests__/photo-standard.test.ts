import { describe, expect, it } from "vitest";
import {
  PHOTO_IDEAL_RATIO,
  PHOTO_MIN_WIDTH,
  PHOTO_RATIO_TOLERANCE,
  photoCheck,
} from "../photo-standard";

describe("photoCheck — the shop's photo standard, as a nudge", () => {
  it("a big 4:5 portrait meets the standard", () => {
    const check = photoCheck(1600, 2000);
    expect(check.level).toBe("ok");
    expect(check.summary).toContain("1600×2000");
    expect(check.summary).toContain("meets");
    expect(check.notes).toHaveLength(0);
  });

  it("photos under 1200px wide get a softness warning — never a block", () => {
    const check = photoCheck(800, 1000);
    expect(check.level).toBe("warn");
    expect(check.notes.join(" ")).toContain("below 1200px");
  });

  it("the wrong shape gets the 4:5 note; a small landscape gets both notes", () => {
    const wide = photoCheck(1600, 800);
    expect(wide.notes.join(" ")).toContain("not 4:5 portrait");
    const smallLandscape = photoCheck(900, 1800);
    expect(smallLandscape.notes).toHaveLength(2);
    expect(smallLandscape.notes.join(" ")).toContain("4:5");
  });

  it("the tolerance band keeps near-misses quiet — square passes, 9:16 fails", () => {
    expect(photoCheck(1600, 1600).level).toBe("ok");
    expect(Math.abs(1200 / 1380 - PHOTO_IDEAL_RATIO)).toBeLessThanOrEqual(
      PHOTO_RATIO_TOLERANCE,
    );
    expect(photoCheck(900, 1800).notes.join(" ")).toContain("4:5");
  });

  it("unreadable images answer a warn without notes (nothing invented)", () => {
    const check = photoCheck(0, 0);
    expect(check.level).toBe("warn");
    expect(check.notes).toHaveLength(0);
    expect(check.summary).toContain("could not read");
  });

  it("the standard itself stays honest — cards really do show 4:5", () => {
    expect(PHOTO_MIN_WIDTH).toBe(1200);
    expect(PHOTO_IDEAL_RATIO).toBe(0.8);
  });
});
