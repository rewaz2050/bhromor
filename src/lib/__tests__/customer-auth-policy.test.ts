import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkNewPassword, CustomerAuthError, validCustomerPhone } from "../customer-auth";

/**
 * Security 2026-10-14 (M6): NEW passwords (signup / password change) need
 * 8+ chars, must not be on the common-password denylist, and must not be
 * trivially guessable patterns. Login keeps its older 6-char floor so
 * existing accounts can still get in.
 */

const problem = (password: unknown): string => {
  try {
    checkNewPassword(password);
    return "";
  } catch (err) {
    return err instanceof CustomerAuthError ? err.message : "threw";
  }
};

describe("checkNewPassword (M6 policy)", () => {
  it("accepts a decent password and returns it", () => {
    expect(checkNewPassword("amar-bari-2026")).toBe("amar-bari-2026");
  });

  it("requires 8+ characters", () => {
    // "ab12" trips the shared 6-char floor first; 7 chars passes that floor
    // and must then trip the NEW 8-char rule.
    expect(problem("ab12")).toMatch(/অক্ষর/);
    expect(problem("1234567")).toMatch(/৮ অক্ষর/);
  });

  it("refuses the common-password denylist (case-insensitive)", () => {
    expect(problem("Password123")).toMatch(/সাধারণ/);
    expect(problem("qwerty123")).toMatch(/সাধারণ/);
    expect(problem("iloveyou")).toMatch(/সাধারণ/);
  });

  it("refuses repeated-character and sequential patterns", () => {
    expect(problem("1111111111")).toMatch(/অনুমান/);
    expect(problem("0123456789")).toMatch(/অনুমান/);
    expect(problem("abcdefghij")).toMatch(/অনুমান/);
  });

  it("throws 422 (not 500) on policy violations", () => {
    try {
      checkNewPassword("123");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CustomerAuthError);
      expect((err as CustomerAuthError).status).toBe(422);
    }
  });
});

describe("validCustomerPhone", () => {
  it("normalizes the common BD forms to 01XXXXXXXXX", () => {
    expect(validCustomerPhone("01712345678")).toBe("01712345678");
    expect(validCustomerPhone("+8801712345678")).toBe("01712345678");
    expect(validCustomerPhone("8801712345678")).toBe("01712345678");
    expect(validCustomerPhone("01712-345678")).toBe("01712345678");
  });

  it("rejects anything that is not a BD mobile number", () => {
    expect(validCustomerPhone("12345")).toBeNull();
    expect(validCustomerPhone("029876543")).toBeNull();
    expect(validCustomerPhone("")).toBeNull();
    expect(validCustomerPhone(null)).toBeNull();
    expect(validCustomerPhone(12345)).toBeNull();
  });
});
