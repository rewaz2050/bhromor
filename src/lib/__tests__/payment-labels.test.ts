/**
 * Batch H (2026-09-18): one answer to "how is this paid, who collects cash?"
 * for every operator screen. The rider card used to say "collect ৳X" on
 * bKash orders the customer had already paid.
 */
import { describe, expect, it } from "vitest";
import { cashToCollect, paymentSummary, walletName } from "../payment-labels";

describe("paymentSummary", () => {
  it("COD is neutral, never awaiting verification, not prepaid", () => {
    const p = paymentSummary({ payment: "cod", paymentStatus: "verified", status: "pending" });
    expect(p).toMatchObject({ short: "COD", tone: "neutral", prepaid: false, awaitingVerification: false });
    expect(walletName("cod")).toBeNull();
  });

  it("a pending wallet payment asks for verification and is treated as prepaid", () => {
    const p = paymentSummary({ payment: "bkash", paymentStatus: "pending_verification", status: "confirmed" });
    expect(p.short).toBe("bKash · verify");
    expect(p.tone).toBe("pending");
    expect(p.awaitingVerification).toBe(true);
    expect(p.prepaid).toBe(true);
  });

  it("a verified wallet payment is settled", () => {
    const p = paymentSummary({ payment: "nagad", paymentStatus: "verified", status: "ready-for-pickup" });
    expect(p.short).toBe("Nagad ✓");
    expect(p.tone).toBe("ok");
    expect(p.awaitingVerification).toBe(false);
  });

  it("a cancelled order with a still-pending wallet payment reads as rejected (never 'verify')", () => {
    const p = paymentSummary({ payment: "bkash", paymentStatus: "pending_verification", status: "cancelled" });
    expect(p.short).toBe("bKash · rejected");
    expect(p.tone).toBe("rejected");
    expect(p.awaitingVerification).toBe(false);
  });

  it("a missing payment method (legacy row) defaults to COD", () => {
    const p = paymentSummary({ payment: undefined as never, paymentStatus: undefined, status: "pending" });
    expect(p.short).toBe("COD");
  });
});

describe("cashToCollect", () => {
  it("is the full total for COD home delivery", () => {
    expect(cashToCollect({ payment: "cod", total: 125000 })).toBe(125000);
  });
  it("is zero for any wallet order — verified or not, the rider never takes cash", () => {
    expect(cashToCollect({ payment: "bkash", total: 125000 })).toBe(0);
    expect(cashToCollect({ payment: "nagad", total: 125000 })).toBe(0);
  });
  it("is zero for a return pickup", () => {
    expect(cashToCollect({ payment: "cod", total: 125000, isReturn: true })).toBe(0);
  });
});
