/**
 * Round 4 hardening (2026-10-14): scrypt cost upgrade with a versioned hash
 * format — s2 (N=32768) for new hashes, s1 (N=16384) still verifies so no
 * existing account is locked out.
 */
import { describe, expect, it, vi } from "vitest";
import { randomBytes, scryptSync } from "node:crypto";

vi.mock("server-only", () => ({}));

import { hashPassword, verifyPassword } from "../customer-auth";

describe("password hashing (scrypt s2)", () => {
  it("writes the s2 format and verifies its own hashes", () => {
    const stored = hashPassword("amar-bari-2026");
    expect(stored.startsWith("s2:")).toBe(true);
    expect(verifyPassword("amar-bari-2026", stored)).toBe(true);
    expect(verifyPassword("amar-bari-2027", stored)).toBe(false);
  });

  it("uses a fresh salt per hash", () => {
    expect(hashPassword("same-password-1")).not.toBe(hashPassword("same-password-1"));
  });

  it("still verifies legacy s1 hashes (no lockout on upgrade)", () => {
    // An s1 hash exactly as hashPassword produced before round 4.
    const salt = randomBytes(16).toString("hex");
    const key = scryptSync("old-account-pass", salt, 64).toString("hex");
    const legacy = `s1:${salt}:${key}`;
    expect(verifyPassword("old-account-pass", legacy)).toBe(true);
    expect(verifyPassword("wrong-pass", legacy)).toBe(false);
  });

  it("rejects malformed stored values without throwing", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "s3:aa:bb")).toBe(false);
    expect(verifyPassword("x", "s2:onlyonepart")).toBe(false);
  });
});
