/**
 * Apply = sign up (2026-09-26): the shop and rider application forms carry
 * the login password. These are the shared client-side rules.
 */
import { describe, expect, it } from "vitest";

import {
  APPLICANT_PASSWORD_MAX,
  APPLICANT_PASSWORD_MIN,
  passwordProblem,
} from "../applicant-password";

describe("passwordProblem (apply = sign up)", () => {
  it("accepts a matching pair of at least the minimum length", () => {
    expect(passwordProblem("secret1", "secret1")).toBeNull();
    expect(passwordProblem("a".repeat(APPLICANT_PASSWORD_MIN), "a".repeat(APPLICANT_PASSWORD_MIN))).toBeNull();
  });

  it("refuses a short password with the length in Bangla", () => {
    expect(passwordProblem("12345", "12345")).toContain("৬");
  });

  it("refuses a password above the bcrypt ceiling", () => {
    const long = "x".repeat(APPLICANT_PASSWORD_MAX + 1);
    expect(passwordProblem(long, long)).toContain("৭২");
  });

  it("refuses a mismatched confirmation", () => {
    expect(passwordProblem("secret1", "secret2")).toMatch(/মিলছে না/);
  });

  it("checks length only when no confirmation is given (server reuse)", () => {
    expect(passwordProblem("secret1")).toBeNull();
    expect(passwordProblem("short")).not.toBeNull();
  });
});
