import { describe, expect, it } from "vitest";
import { bdt } from "../format";
import {
  REFERRAL_DEFAULTS,
  creditCouponCodeFor,
  displayRefCode,
  isRefCode,
  normalizeRefCode,
  redeemReferral,
  referralCodeFor,
  referralLink,
  sanitizeReferral,
  shareMessage,
} from "../referral";

const code = referralCodeFor("customer-1");
const record = {
  code,
  customerId: "customer-1",
  referrerName: "Rahat",
  referrerPhone: "01711111111",
  rewardsGranted: 0,
  createdAt: 0,
};

describe("Referral codes", () => {
  it("is stable per account and different across accounts", () => {
    expect(referralCodeFor("customer-1")).toBe(referralCodeFor("customer-1"));
    expect(referralCodeFor("customer-1")).not.toBe(referralCodeFor("customer-2"));
    expect(isRefCode(code)).toBe(true);
    expect(referralCodeFor("")).toBe("");
  });

  it("never contains the ambiguous characters", () => {
    for (let i = 0; i < 400; i++) {
      const c = referralCodeFor(`id-${i}`);
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{6}$/);
    }
  });

  it("reads a code out of a pasted message", () => {
    expect(normalizeRefCode(` ps-${code.toLowerCase()} `)).toBe(code);
    expect(normalizeRefCode(`my code is PS-${code} thanks!`)).toBe(code);
    expect(normalizeRefCode("01712345678")).toBe("");
    expect(normalizeRefCode(null)).toBe("");
    // 0/1/I/O/L/U are not in the alphabet at all — a code with them is a typo.
    expect(normalizeRefCode("ABCDEF")).toBe("ABCDEF");
    expect(isRefCode("ABCDEF")).toBe(true);
    expect(isRefCode("AB0000")).toBe(false);
    expect(isRefCode("AB")).toBe(false);
  });

  it("formats shareables", () => {
    expect(displayRefCode(code)).toBe(`PS-${code}`);
    expect(referralLink("https://prosanti.com/", code)).toBe(`https://prosanti.com/shop?ref=${code}`);
    expect(creditCouponCodeFor(code)).toBe(`PSREF${code}`);
    expect(shareMessage("Rahat", code, "https://x/y", "bn")).toContain("৳50");
    expect(shareMessage("", code, "https://x/y", "en")).toContain("PS-");
  });
});

describe("Referral config", () => {
  it("clamps the reward so a typo cannot print money", () => {
    expect(sanitizeReferral(null)).toEqual(REFERRAL_DEFAULTS);
    const tight = sanitizeReferral({ friendRewardPaisa: 999_999_999, maxRewardsPerReferrer: -3 });
    expect(tight.friendRewardPaisa).toBe(bdt(1000));
    expect(tight.maxRewardsPerReferrer).toBe(1);
  });
});

describe("Redemption gate", () => {
  const base = {
    records: [record],
    buyerOrderCount: 0,
    buyerPhone: "01722222222",
    subtotal: bdt(900),
    cfg: REFERRAL_DEFAULTS,
  };

  it("pays a first-time buyer who was sent here", () => {
    const out = redeemReferral({ ...base, rawCode: code });
    expect(out.ok).toBe(true);
    expect(out.discount).toBe(bdt(50));
    expect(out.referrer?.referrerPhone).toBe("01711111111");
  });

  it("never lets you referral yourself", () => {
    expect(redeemReferral({ ...base, buyerPhone: "+8801711111111", rawCode: code }).reason).toMatch(/own referral/);
  });

  it("is a first-order offer, full stop", () => {
    expect(redeemReferral({ ...base, buyerOrderCount: 1, rawCode: code }).reason).toMatch(/first order/);
  });

  it("needs a bag worth the discount", () => {
    expect(redeemReferral({ ...base, subtotal: bdt(120), rawCode: code }).reason).toMatch(/taka bag/);
  });

  it("stops at the referrer's cap and at a bad code", () => {
    expect(
      redeemReferral({ ...base, rawCode: code, records: [{ ...record, rewardsGranted: REFERRAL_DEFAULTS.maxRewardsPerReferrer }] })
        .reason,
    ).toMatch(/referral limit/);
    expect(redeemReferral({ ...base, rawCode: "ZZZZZZ" }).reason).toMatch(/could not find/);
    expect(redeemReferral({ ...base, rawCode: "abc" }).reason).toMatch(/format/);
    expect(redeemReferral({ ...base, rawCode: "" }).reason).toMatch(/6-character/);
  });

  it("goes quiet when the shop pauses the programme", () => {
    const out = redeemReferral({ ...base, cfg: sanitizeReferral({ enabled: false }), rawCode: code });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/paused/);
  });

  it("refuses a device that already used one", () => {
    expect(redeemReferral({ ...base, rawCode: code, alreadyRedeemedBy: [code] }).reason).toMatch(/already used/);
  });

  it("never discounts more than the bag", () => {
    const out = redeemReferral({
      ...base,
      cfg: sanitizeReferral({ friendRewardPaisa: bdt(5000), minOrderPaisa: bdt(100) }),
      subtotal: bdt(900),
      rawCode: code,
    });
    expect(out.discount).toBe(bdt(900));
  });
});
