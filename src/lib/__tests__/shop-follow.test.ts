/**
 * B1 (2026-09-28) — the shop-follow form body.
 *
 * /api/shop-follow refuses a bad number BEFORE touching the database (or the
 * service key), and it stores the normalized 11-digit form so "017 1234-5678"
 * and "01712345678" are one follower, not two. The marketing tick defaults to
 * ON (the shopper asked for news by using the card) but an explicit
 * `marketingOk: false` is preserved — that number must never be messaged.
 */
import { describe, expect, it } from "vitest";
import { validateShopFollow } from "@/lib/shop-follow";

describe("validateShopFollow", () => {
  it("accepts a normal 11-digit number and normalizes it", () => {
    const checked = validateShopFollow({
      shopId: "shop-1",
      phone: "017 1234-5678",
    });
    expect(checked.ok).toBe(true);
    expect(checked.value).toEqual({
      shopId: "shop-1",
      phone: "01712345678",
      marketingOk: true,
    });
    expect(checked.errors).toEqual({});
  });

  it("keeps an explicit opt-out out of the message list", () => {
    const checked = validateShopFollow({
      shopId: "shop-1",
      phone: "01712345678",
      marketingOk: false,
    });
    expect(checked.value.marketingOk).toBe(false);
  });

  it("only treats the literal true as consent", () => {
    // A string "false" from a hand-rolled client is not consent.
    expect(
      validateShopFollow({ shopId: "s", phone: "01712345678", marketingOk: "false" })
        .value.marketingOk,
    ).toBe(false);
    expect(
      validateShopFollow({ shopId: "s", phone: "01712345678", marketingOk: "yes" })
        .value.marketingOk,
    ).toBe(false);
  });

  it("refuses a missing shop and a phone that is not a BD mobile", () => {
    const noShop = validateShopFollow({ phone: "01712345678" });
    expect(noShop.ok).toBe(false);
    expect(noShop.errors.shopId).toMatch(/which shop/i);
    expect(noShop.value.phone).toBe("01712345678");

    const badPhone = validateShopFollow({ shopId: "shop-1", phone: "12345" });
    expect(badPhone.ok).toBe(false);
    expect(badPhone.errors.phone).toMatch(/mobile number/i);
    // Nothing written: an empty phone stays empty rather than becoming "01".
    expect(badPhone.value.phone).toBe("");
  });

  it("tolerates an empty body (never throws on junk input)", () => {
    for (const raw of [null, undefined, "nope", 7, []]) {
      const checked = validateShopFollow(raw);
      expect(checked.ok).toBe(false);
      expect(checked.value.shopId).toBe("");
    }
  });

  it("trims and caps long fields instead of failing the whole request", () => {
    const checked = validateShopFollow({
      shopId: `  ${"s".repeat(90)}  `,
      phone: "01712345678",
    });
    expect(checked.ok).toBe(true);
    expect(checked.value.shopId).toHaveLength(64);
  });
});
