import { describe, expect, it } from "vitest";
import { bdt } from "../format";
import {
  GIFT_DEFAULTS,
  giftCardText,
  giftRiderNote,
  giftSlipNote,
  sanitizeGift,
  validateGift,
  wrapFeeFor,
  wrapOptions,
} from "../gift";

describe("Gift config", () => {
  it("keeps sane caps and refuses absurd ones", () => {
    expect(sanitizeGift(null)).toEqual(GIFT_DEFAULTS);
    expect(sanitizeGift({ enabled: true, maxMessageChars: 99999, premiumWrapFeePaisa: -5 })).toEqual({
      enabled: true,
      standardWrapFeePaisa: GIFT_DEFAULTS.standardWrapFeePaisa,
      premiumWrapFeePaisa: 0,
      maxMessageChars: 500,
      maxRecipientChars: 60,
    });
  });

  it("hides a wrap option the shop priced to zero", () => {
    const ids = wrapOptions(sanitizeGift({ standardWrapFeePaisa: 0, premiumWrapFeePaisa: 0 })).map((o) => o.id);
    expect(ids).toEqual(["none"]);
    expect(wrapOptions(GIFT_DEFAULTS).map((o) => o.id)).toEqual(["none", "standard", "premium"]);
  });
});

describe("Gift validation", () => {
  it("is a no-op for a normal order", () => {
    const out = validateGift({ name: "Rahat" });
    expect(out.ok).toBe(true);
    expect(out.value).toEqual({
      isGift: false,
      recipientName: "",
      recipientPhone: "",
      message: "",
      wrap: "none",
      feePaisa: 0,
    });
  });

  it("demands a name when a gift is claimed", () => {
    const out = validateGift({ is_gift: true, gift_message: "Eid Mubarak" });
    expect(out.ok).toBe(false);
    expect(out.errors.recipientName).toMatch(/Who is it for/);
  });

  it("charges the wrap the shopper picked", () => {
    expect(validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_wrap: "premium" }).value.feePaisa).toBe(
      bdt(150),
    );
    expect(validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_wrap: "standard" }).value.feePaisa).toBe(
      bdt(50),
    );
    expect(validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_wrap: "none" }).value.feePaisa).toBe(0);
    // A gift with no wrap is still a gift — the card and the hidden price apply.
    expect(validateGift({ is_gift: true, gift_recipient_name: "Karim" }).value.wrap).toBe("standard");
  });

  it("normalizes the recipient phone and rejects a wrong one", () => {
    expect(
      validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_recipient_phone: "+880 17-1234 5678" }).value
        .recipientPhone,
    ).toBe("01712345678");
    expect(validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_recipient_phone: "12345" }).ok).toBe(false);
  });

  it("clips the card message to the configured cap", () => {
    const long = "X".repeat(900);
    const out = validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_message: long });
    expect(out.value.message).toHaveLength(GIFT_DEFAULTS.maxMessageChars);
  });

  it("switches the whole feature off without breaking checkout", () => {
    const off = sanitizeGift({ enabled: false });
    const out = validateGift({ is_gift: true, gift_recipient_name: "Karim", gift_wrap: "premium" }, off);
    expect(out.value.feePaisa).toBe(0);
    expect(out.value.isGift).toBe(false);
  });
});

describe("Gift handoff copy", () => {
  const gift = validateGift({
    is_gift: true,
    gift_recipient_name: "Karim Uddin",
    gift_message: "Eid Mubarak, Bhai",
    gift_wrap: "standard",
  }).value;

  it("tells the rider not to quote the price", () => {
    expect(giftRiderNote(gift)).toBe(
      "GIFT — hand to Karim Uddin and do not quote the price.",
    );
    expect(giftRiderNote({ isGift: false, recipientName: "" })).toBe("");
  });

  it("writes the card", () => {
    expect(giftCardText(gift)).toContain("For Karim Uddin");
    expect(giftCardText(gift)).toContain("“Eid Mubarak, Bhai”");
    expect(giftCardText(validateGift({}).value)).toBe("");
  });

  it("hides the price on the slip", () => {
    expect(giftSlipNote(gift)).toMatch(/no prices/);
    expect(giftSlipNote({ isGift: false })).toBe("");
  });
});

describe("wrapFeeFor", () => {
  it("falls back to free for anything unrecognized", () => {
    expect(wrapFeeFor("diamond", GIFT_DEFAULTS)).toBe(0);
    expect(wrapFeeFor(undefined, GIFT_DEFAULTS)).toBe(0);
    expect(wrapFeeFor("premium", GIFT_DEFAULTS)).toBe(bdt(150));
  });
});
