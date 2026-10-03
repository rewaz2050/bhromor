import { describe, expect, it } from "vitest";
import {
  INCENTIVE_DEFAULTS,
  anyIncentiveOn,
  awardMessage,
  dailyBonusOn,
  dailyProgress,
  dhakaWeekStart,
  normalizeReferralCode,
  parseIncentiveInput,
  referralBonusOn,
  referralOutcomeMessage,
  referralShareText,
  sanitizeIncentiveSettings,
  weeklyBonusOn,
  weeklyProgress,
  weeklyTier2On,
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
      dailyTarget: 100, dailyBonus: 0, referralBonus: 0, referralAfter: 1, weeklyTarget: 0, weeklyBonus: 0, weeklyTarget2: 0, weeklyBonus2: 0,
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
      settings: { dailyTarget: 8, dailyBonus: 5000, referralBonus: 20000, referralAfter: 10, weeklyTarget: 0, weeklyBonus: 0, weeklyTarget2: 0, weeklyBonus2: 0 },
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

describe("weekly bonus", () => {
  const wk = { ...INCENTIVE_DEFAULTS, weeklyTarget: 40, weeklyBonus: 30000, weeklyTarget2: 50, weeklyBonus2: 20000 };
  const ok = { dailyTarget: 0, dailyBonusTaka: 0, referralBonusTaka: 0, referralAfter: 10 };

  it("is off by default, and a tier needs both its target and its amount", () => {
    expect(weeklyBonusOn(INCENTIVE_DEFAULTS)).toBe(false);
    expect(weeklyBonusOn({ ...INCENTIVE_DEFAULTS, weeklyTarget: 40 })).toBe(false);
    expect(weeklyBonusOn(wk)).toBe(true);
    expect(anyIncentiveOn({ ...INCENTIVE_DEFAULTS, weeklyTarget: 40, weeklyBonus: 100 })).toBe(true);
  });
  it("tier 2 only counts above tier 1 (as the SQL does)", () => {
    expect(weeklyTier2On(wk)).toBe(true);
    expect(weeklyTier2On({ ...wk, weeklyTarget2: 40 })).toBe(false);
    expect(weeklyTier2On({ ...wk, weeklyTarget2: 30 })).toBe(false);
    expect(weeklyTier2On({ ...wk, weeklyBonus2: 0 })).toBe(false);
  });
  it("old clients without weekly fields still save, with the weekly bonus off", () => {
    const r = parseIncentiveInput(ok);
    expect(r.ok && r.settings).toMatchObject({ weeklyTarget: 0, weeklyBonus: 0, weeklyTarget2: 0, weeklyBonus2: 0 });
  });
  it("saves both tiers in paisa", () => {
    const r = parseIncentiveInput({ ...ok, weeklyTarget: "40", weeklyBonusTaka: "300", weeklyTarget2: "50", weeklyBonus2Taka: "200" });
    expect(r.ok && r.settings).toMatchObject({ weeklyTarget: 40, weeklyBonus: 30000, weeklyTarget2: 50, weeklyBonus2: 20000 });
  });
  it.each([
    [{ weeklyTarget: "40" }, /both the weekly target/],
    [{ weeklyBonusTaka: "300" }, /both the weekly target/],
    [{ weeklyTarget: "701", weeklyBonusTaka: "300" }, /between 0 and 700/],
    [{ weeklyTarget: "40", weeklyBonusTaka: "5001" }, /Weekly bonus/],
    [{ weeklyTarget2: "50", weeklyBonus2Taka: "200" }, /set the weekly target first/],
    [{ weeklyTarget: "40", weeklyBonusTaka: "300", weeklyTarget2: "50" }, /tier-2 target and its bonus/],
    [{ weeklyTarget: "40", weeklyBonusTaka: "300", weeklyTarget2: "40", weeklyBonus2Taka: "200" }, /higher/],
    [{ weeklyTarget: "40", weeklyBonusTaka: "300", weeklyTarget2: "30", weeklyBonus2Taka: "200" }, /higher/],
  ])("refuses %j", (extra, msg) => {
    const r = parseIncentiveInput({ ...ok, ...extra });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
  it("sanitises stray stored values", () => {
    expect(sanitizeIncentiveSettings({ weeklyTarget: 99999, weeklyBonus: -3, weeklyTarget2: "abc" })).toMatchObject({ weeklyTarget: 700, weeklyBonus: 0, weeklyTarget2: 0 });
  });
  it("progress: how far the next tier is, and which tiers are done / paid", () => {
    expect(weeklyProgress(5, INCENTIVE_DEFAULTS)).toBeNull();
    expect(weeklyProgress(30, wk)).toMatchObject({ done: 30, toNext: 10, percent: 60 });
    const mid = weeklyProgress(45, wk, new Set([1]));
    expect(mid?.tiers.map((t) => [t.reached, t.paid])).toEqual([[true, true], [false, false]]);
    expect(mid?.toNext).toBe(5);
    expect(weeklyProgress(80, wk)).toMatchObject({ toNext: 0, percent: 100 });
    expect(weeklyProgress(3, { ...INCENTIVE_DEFAULTS, weeklyTarget: 4, weeklyBonus: 1 })?.tiers).toHaveLength(1);
  });
  it("the week starts on Monday in Dhaka — also across the UTC date line", () => {
    expect(dhakaWeekStart(Date.parse("2026-10-02T08:00:00Z"))).toBe("2026-09-28"); // Fri
    expect(dhakaWeekStart(Date.parse("2026-09-28T00:00:00+06:00"))).toBe("2026-09-28"); // Mon 00:00 Dhaka
    expect(dhakaWeekStart(Date.parse("2026-09-27T23:59:00+06:00"))).toBe("2026-09-21"); // Sun night
    expect(dhakaWeekStart(Date.parse("2026-09-27T20:00:00Z"))).toBe("2026-09-28"); // Sun 20:00Z = Mon 02:00 Dhaka
  });
  it("the push says weekly", () => {
    expect(awardMessage({ kind: "weekly_target", amount: 30000 }).title).toMatch(/সাপ্তাহিক/);
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
