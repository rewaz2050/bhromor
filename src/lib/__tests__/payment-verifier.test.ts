import { describe, expect, it } from "vitest";
import {
  PAYMENT_VERIFIERS,
  parsePaymentVerifier,
  requirePaymentVerifier,
  shopMayVerify,
  staffMayVerify,
} from "../payment-verifier";

describe("payment verifier setting (audit N6)", () => {
  it("who may decide, per setting", () => {
    expect(PAYMENT_VERIFIERS.map((v) => [v, staffMayVerify(v), shopMayVerify(v)])).toEqual([
      ["platform", true, false],
      ["shop", false, true],
      ["both", true, true],
    ]);
  });

  it("absent means both — the behaviour before the setting existed", () => {
    expect(staffMayVerify(undefined)).toBe(true);
    expect(shopMayVerify(undefined)).toBe(true);
  });

  it("reads junk as the safe default but refuses it as admin input", () => {
    expect(parsePaymentVerifier("nobody")).toBe("both");
    expect(parsePaymentVerifier(null)).toBe("both");
    expect(requirePaymentVerifier("nobody")).toBeNull();
    expect(requirePaymentVerifier("shop")).toBe("shop");
  });
});
