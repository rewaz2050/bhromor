import { describe, expect, it } from "vitest";
import {
  INCENTIVE_DEFAULTS,
  anyIncentiveOn,
  awardMessage,
  dailyBonusOn,
  dailyProgress,
  normalizeReferralCode,
  parseIncentiveInput,
  referralBonusOn,
  referralOutcomeMessage,
  referralShareText,
  sanitizeIncentiveSettings,
} from "../rider-incentives";

describe("settings", () => {
  it("are all off by default", () => {
    expect(anyIncentiveOn(INCENTIVE_DEFAULTS)).toBe(false);
  });
  it("a daily bonus needs both its target and its amount", () => {
    expect(dailyBonusOn({ ...INCENTIVE_DEFAULTS, dailyTarget: 5 })).toBe(false);
    expect(dailyBonusOn({ ...INCENTIVE_DEFAULTS, dailyBonus: 5000 })).toBe(false);
    expect(dailyBonusOn({ ...INCENTIVE_DEFAULTS, dailyTarget: 5, dailyBonus: 5000 })).toBe(true);
    expect(referralBonusOn({ ...INCENTIVE_DEFAULTS, referralBonus: 100 })).toBe(true);
  });
  it("sanitize clamps strays and falls back on junk", () => {
    expect(sanitizeIncentiveSettings({ dailyTarget: 9999, dailyBonus: -5, referralBonus: "abc", referralAfter: 0 })).toEqual({
      dailyTarget: 100, dailyBonus: 0, referralBonus: 0, referralAfter: 1,
    });
    expect(sanitizeIncentiveSettings(null)).toEqual(INCENTIVE_DEFAULTS);
    expect(sanitizeIncentiveSettings({ dailyTarget: "8", dailyBonus: "5000" }).dailyTarget).toBe(8);
  });
});

describe("parseIncentiveInput", () => {
  const ok = { dailyTarget: "8", dailyBonusTaka: "50", referralBonusTaka: "200", referralAfter: "10" };
  it("turns taka into paisa", () => {
    expect(parseIncentiveInput(ok)).toEqual({
      ok: true,
      settings: { dailyTarget: 8, dailyBonus: 5000, referralBonus: 20000, referralAfter: 10 },
    });
  });
  it("accepts everything off", () => {
    const r = parseIncentiveInput({ dailyTarget: 0, dailyBonusTaka: 0, referralBonusTaka: 0, referralAfter: 10 });
    expect(r.ok).toBe(true);
  });
  it.each([
    [{ ...ok, dailyTarget: "2.5" }, /whole number/],
    [{ ...ok, dailyTarget: "101" }, /between/],
    [{ ...ok, dailyBonusTaka: "5001" }, /Daily bonus/],
    [{ ...ok, referralBonusTaka: "-1" }, /Referral bonus/],
    [{ ...ok, referralAfter: "0" }, /Referral deliveries/],
    [{ ...ok, dailyTarget: "0" }, /both/],
    [{ ...ok, dailyBonusTaka: "0" }, /both/],
    [{}, /Daily target/],
    [null, /Daily target/],
  ])("refuses %j", (input, msg) => {
    const r = parseIncentiveInput(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe("referral code", () => {
  it("normalises typing noise", () => {
    expect(normalizeReferralCode(" k7m-q2x ")).toBe("K7MQ2X");
    expect(normalizeReferralCode("ab")).toBe("");
    expect(normalizeReferralCode("A".repeat(13))).toBe("");
    expect(normalizeReferralCode(42)).toBe("");
  });
  it("says nothing when no code was given, and does not blame the applicant when it did not match", () => {
    expect(referralOutcomeMessage("none")).toBeNull();
    expect(referralOutcomeMessage("registered")).toMatch(/গ্রহণ/);
    for (const o of ["unknown", "self", "already", "not_new"] as const) {
      expect(referralOutcomeMessage(o)).toMatch(/আবেদন ঠিকই জমা/);
    }
  });
  it("share text carries the code and the promise", () => {
    expect(referralShareText("K7MQ2X", 20000, 10)).toContain("K7MQ2X");
    expect(referralShareText("K7MQ2X", 20000, 10)).toContain("৳200");
    expect(referralShareText("K7MQ2X", 0, 10)).not.toContain("বোনাস পাব");
  });
});

describe("progress and messages", () => {
  it("dailyProgress", () => {
    expect(dailyProgress(3, 8)).toEqual({ done: 3, target: 8, left: 5, reached: false, percent: 38 });
    expect(dailyProgress(9, 8)).toMatchObject({ left: 0, reached: true, percent: 100 });
    expect(dailyProgress(2, 0)).toMatchObject({ reached: false, percent: 0 });
  });
  it("award push names the amount", () => {
    expect(awardMessage({ kind: "daily_target", amount: 5000 }).body).toContain("৳50");
    expect(awardMessage({ kind: "referral", amount: 20000 }).title).toContain("রেফারেল");
  });
});
