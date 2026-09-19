/**
 * P0 #6 — every message the order form can receive is said in Bangla first,
 * and each one points at the field the shopper must fix.
 */
import { describe, expect, it } from "vitest";
import {
  fieldForServerError,
  firstErrorField,
  friendlyOrderError,
} from "@/lib/checkout-errors";

describe("friendlyOrderError", () => {
  it("maps the stock RPC message with product + count", () => {
    const f = friendlyOrderError('only 2 left of "Panjabi Classic"');
    expect(f.bn).toContain("Panjabi Classic");
    expect(f.bn).toContain("২টি".replace("২", "2")); // digits are kept western for staff matching
    expect(f.en).toBe('only 2 left of "Panjabi Classic"');
  });

  it("maps curly-quoted server validation strings", () => {
    const f = friendlyOrderError("“Panjabi Classic” is not available right now.");
    expect(f.bn).toMatch(/Panjabi Classic/);
    expect(f.bn).toMatch(/পাওয়া যাচ্ছে না/);
  });

  it("maps the Zone D minimum with the number the database quoted", () => {
    const f = friendlyOrderError("Zone D requires minimum ৳500 order");
    expect(f.bn).toContain("৳500");
    expect(f.bn).toMatch(/সুনামগঞ্জ সদরের বাইরে/);
  });

  it("maps slot-full, coupon, shop-closed and rate-limit messages", () => {
    expect(friendlyOrderError("Delivery slot full for 2026-09-18 evening - choose another window").bn).toMatch(/স্লট/);
    expect(friendlyOrderError("coupon minimum not met").bn).toMatch(/কুপন/);
    expect(friendlyOrderError("“Rahat Store” is closed right now — its bag stays saved for when it reopens.").bn).toMatch(/বন্ধ/);
    expect(friendlyOrderError("Too many attempts — please wait a minute and try again.").bn).toMatch(/এক মিনিট/);
  });

  it("maps the 422 field messages to Bangla", () => {
    expect(friendlyOrderError("A valid Bangladeshi mobile number is required (e.g. 017XXXXXXXX).").bn).toMatch(/মোবাইল/);
    expect(friendlyOrderError("Please share a full delivery address (house/road/landmark).").bn).toMatch(/ঠিকানা/);
    expect(friendlyOrderError("First send the total to bKash and enter the TRXID you received.").bn).toMatch(/bKash/);
  });

  it("passes unknown English through (never hides a real reason) and keeps Bangla as-is", () => {
    const unknown = friendlyOrderError("Something odd happened");
    expect(unknown.en).toBe("Something odd happened");
    expect(unknown.bn).toMatch(/অর্ডার প্লেস করা যায়নি/);
    const bangla = friendlyOrderError("পাড়া লিখুন");
    expect(bangla.bn).toBe("পাড়া লিখুন");
    expect(bangla.en).toBe("");
  });

  it("empty input → generic retry copy", () => {
    expect(friendlyOrderError("").bn).toMatch(/আবার চেষ্টা/);
    expect(friendlyOrderError(undefined).en).toMatch(/try again/i);
  });
});

describe("fieldForServerError", () => {
  it("normalises server field names onto the form's names", () => {
    expect(fieldForServerError("village", "")).toBe("area");
    expect(fieldForServerError("items.0.qty", "")).toBe("items");
    expect(fieldForServerError("gift.recipientName", "")).toBe("gift");
    expect(fieldForServerError("paymentRef", "")).toBe("trxid");
    expect(fieldForServerError("payment", "")).toBe("payMethod");
    expect(fieldForServerError("phone", "")).toBe("phone");
  });

  it("infers the field from the message when the server sent none", () => {
    expect(fieldForServerError(null, 'only 1 left of "X"')).toBe("items");
    expect(fieldForServerError(null, "coupon not found")).toBe("couponCode");
    expect(fieldForServerError(null, "Delivery slot full for …")).toBe("timeSlot");
    expect(fieldForServerError(null, "Zone D requires minimum ৳500 order")).toBe("items");
    expect(fieldForServerError(null, "Could not place the order")).toBeNull();
  });
});

describe("firstErrorField", () => {
  it("returns the first field in FORM order, not in object order", () => {
    expect(firstErrorField({ trxid: "x", phone: "y", address: "z" })).toBe("phone");
    expect(firstErrorField({ couponCode: "x", items: "y" })).toBe("items");
    expect(firstErrorField({ phone: "" })).toBeNull();
    expect(firstErrorField({ mystery: "x" })).toBe("mystery");
  });
});
