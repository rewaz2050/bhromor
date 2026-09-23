import { describe, expect, it } from "vitest";
import {
  DISMISS_FOR_MS,
  countVisit,
  dayKey,
  detectPlatform,
  isIosSafari,
  sanitizeInstallMemory,
  sanitizeVisits,
  shouldOfferInstall,
} from "@/lib/install-prompt";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";

const base = {
  memory: { dismissedAt: 0, installed: false },
  visits: { count: 2, lastDay: "2026-09-20" },
  standalone: false,
  hasNativePrompt: true,
  ua: ANDROID_CHROME,
};

describe("add-to-home-screen rules", () => {
  it("counts one visit per day", () => {
    const day1 = Date.UTC(2026, 8, 20, 10);
    const v1 = countVisit({ count: 0, lastDay: "" }, day1);
    expect(v1.count).toBe(1);
    expect(countVisit(v1, day1 + 3600_000)).toEqual(v1); // same day → unchanged
    expect(countVisit(v1, day1 + 26 * 3600_000).count).toBe(2);
    expect(dayKey(day1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never asks on the first visit, inside the app, or after installing", () => {
    expect(shouldOfferInstall({ ...base, visits: { count: 1, lastDay: "" } })).toBeNull();
    expect(shouldOfferInstall({ ...base, standalone: true })).toBeNull();
    expect(shouldOfferInstall({ ...base, memory: { dismissedAt: 0, installed: true } })).toBeNull();
    expect(shouldOfferInstall(base)).toBe("native");
  });

  it("respects 'not now' for thirty days", () => {
    const now = 1_800_000_000_000;
    expect(
      shouldOfferInstall({ ...base, memory: { dismissedAt: now - DISMISS_FOR_MS + 1000, installed: false } }, now),
    ).toBeNull();
    expect(
      shouldOfferInstall({ ...base, memory: { dismissedAt: now - DISMISS_FOR_MS - 1000, installed: false } }, now),
    ).toBe("native");
  });

  it("falls back to the iOS instruction only in Safari on iPhone", () => {
    expect(shouldOfferInstall({ ...base, hasNativePrompt: false, ua: IOS_SAFARI })).toBe("ios");
    expect(shouldOfferInstall({ ...base, hasNativePrompt: false, ua: IOS_CHROME })).toBeNull();
    expect(shouldOfferInstall({ ...base, hasNativePrompt: false, ua: ANDROID_CHROME })).toBeNull();
    expect(detectPlatform(IOS_SAFARI)).toBe("ios");
    expect(detectPlatform(ANDROID_CHROME)).toBe("android");
    expect(isIosSafari(IOS_CHROME)).toBe(false);
  });

  it("tolerates corrupted storage", () => {
    expect(sanitizeInstallMemory("junk")).toEqual({ dismissedAt: 0, installed: false });
    expect(sanitizeInstallMemory({ dismissedAt: "x", installed: "yes" })).toEqual({ dismissedAt: 0, installed: false });
    expect(sanitizeVisits({ count: -4 })).toEqual({ count: 0, lastDay: "" });
    expect(sanitizeVisits({ count: 5000, lastDay: "2026-01-01" }).count).toBe(999);
  });
});
