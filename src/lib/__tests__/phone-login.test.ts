/**
 * Round 4 (2026-09-26) — phone-number login without SMS: a mobile number
 * maps to a synthetic Supabase e-mail and back, and every login form
 * accepts either.
 */
import { describe, expect, it } from "vitest";
import {
  PHONE_LOGIN_DOMAIN,
  describeLoginEmail,
  isPhoneLoginEmail,
  loginHandleFor,
  loginIdentifierToEmail,
  parseLoginIdentifier,
  phoneFromLoginEmail,
  phoneLoginEmail,
} from "../phone-login";

describe("phoneLoginEmail / isPhoneLoginEmail", () => {
  it("mints one address per mobile number whatever the spelling", () => {
    expect(phoneLoginEmail("01712345678")).toBe(`01712345678@${PHONE_LOGIN_DOMAIN}`);
    expect(phoneLoginEmail("+880 1712-345678")).toBe("01712345678@phone.prosanti.app");
    expect(phoneLoginEmail("০১৭১২৩৪৫৬৭৮")).toBe("01712345678@phone.prosanti.app");
  });

  it("recognises only its own addresses", () => {
    expect(isPhoneLoginEmail("01712345678@phone.prosanti.app")).toBe(true);
    expect(isPhoneLoginEmail(" 01712345678@PHONE.prosanti.app ")).toBe(true);
    expect(isPhoneLoginEmail("rider@example.com")).toBe(false);
    expect(isPhoneLoginEmail("01712345678@phone.prosanti.app.evil.com")).toBe(false);
    expect(isPhoneLoginEmail("0212345678@phone.prosanti.app")).toBe(false);
    expect(isPhoneLoginEmail(null)).toBe(false);
  });

  it("recovers the number behind a synthetic address", () => {
    expect(phoneFromLoginEmail("01712345678@phone.prosanti.app")).toBe("01712345678");
    expect(phoneFromLoginEmail("shop@example.com")).toBeNull();
    expect(loginHandleFor("01712345678@phone.prosanti.app")).toBe("01712345678");
    expect(loginHandleFor("shop@example.com")).toBe("shop@example.com");
  });
});

describe("parseLoginIdentifier", () => {
  it("passes real e-mails through, lower-cased", () => {
    expect(parseLoginIdentifier(" Shop@Example.com ")).toEqual({ kind: "email", email: "shop@example.com" });
  });

  it("turns a BD mobile number — typed any way — into the synthetic address", () => {
    expect(parseLoginIdentifier("017 1234 5678")).toEqual({
      kind: "phone",
      phone: "01712345678",
      email: "01712345678@phone.prosanti.app",
    });
    expect(parseLoginIdentifier("+8801712345678").kind).toBe("phone");
    expect(parseLoginIdentifier("০১৭১২৩৪৫৬৭৮").kind).toBe("phone");
  });

  it("rejects what is neither", () => {
    expect(parseLoginIdentifier("")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("shop@")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("12345")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("0212345678")).toEqual({ kind: "invalid" });
    expect(parseLoginIdentifier("abc")).toEqual({ kind: "invalid" });
    expect(loginIdentifierToEmail("abc")).toBeNull();
    expect(loginIdentifierToEmail("01712345678")).toBe("01712345678@phone.prosanti.app");
  });
});

describe("describeLoginEmail", () => {
  it("shows staff the number plus a tag instead of the synthetic address", () => {
    expect(describeLoginEmail("01712345678@phone.prosanti.app")).toBe("01712345678 (phone login)");
    expect(describeLoginEmail("01712345678@phone.prosanti.app", "bn")).toBe("01712345678 (ফোন লগইন)");
    expect(describeLoginEmail("shop@example.com")).toBe("shop@example.com");
    expect(describeLoginEmail(undefined)).toBe("no email");
    expect(describeLoginEmail("", "bn")).toBe("ইমেইল নেই");
  });
});
