/**
 * WhatsApp hand-offs for applicants (apply = sign up, 2026-09-26): approval
 * and password-reset messages carry the login URL and never a password.
 */
import { describe, expect, it } from "vitest";
import {
  applicantLoginUrl,
  approvalMessage,
  approvalWhatsAppLink,
  passwordResetMessage,
  passwordResetWhatsAppLink,
  resetApprovedMessage,
  resetApprovedWhatsAppLink,
  resetRejectedMessage,
} from "../onboarding-messages";

describe("applicantLoginUrl", () => {
  it("points vendors and riders at their own login pages", () => {
    expect(applicantLoginUrl("vendor")).toMatch(/\/vendor\/login$/);
    expect(applicantLoginUrl("rider")).toMatch(/\/rider\/login$/);
    expect(applicantLoginUrl("vendor")).toMatch(/^https?:\/\//);
  });
});

describe("approvalMessage", () => {
  it("names the applicant, repeats the login email and links the login page", () => {
    const text = approvalMessage({ kind: "vendor", name: "Arian Fashion", email: "shop@example.com" });
    expect(text).toContain("Arian Fashion");
    expect(text).toContain("shop@example.com");
    expect(text).toContain(applicantLoginUrl("vendor"));
    expect(text).toContain("অনুমোদিত");
  });

  it("has a rider variant with the rider login and the go-online hint", () => {
    const text = approvalMessage({ kind: "rider", name: "Tanvir" });
    expect(text).toContain(applicantLoginUrl("rider"));
    expect(text).toContain("অনলাইন");
    expect(text).not.toContain("()");
  });
});

describe("passwordResetMessage", () => {
  it("links the login page and never accepts a password to embed", () => {
    const text = passwordResetMessage({ kind: "rider", name: "Tanvir" });
    expect(text).toContain(applicantLoginUrl("rider"));
    expect(text).toContain("অস্থায়ী পাসওয়ার্ড");
    expect(text).toContain("বদলে");
  });
});

describe("wa.me links", () => {
  it("builds a wa.me deep link with the encoded message for a BD mobile", () => {
    const href = approvalWhatsAppLink({ kind: "vendor", name: "Arian", phone: "01712345678" });
    expect(href).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
    expect(decodeURIComponent(href ?? "")).toContain(applicantLoginUrl("vendor"));
  });

  it("returns null for a phone that is not a BD mobile", () => {
    expect(approvalWhatsAppLink({ kind: "vendor", name: "Arian", phone: "12345" })).toBeNull();
    expect(passwordResetWhatsAppLink({ kind: "rider", name: "T", phone: null })).toBeNull();
  });
});

describe("reset REQUEST decisions (no SMS / e-mail)", () => {
  it("tells an approved requester where to set the password and how long they have", () => {
    const text = resetApprovedMessage({ kind: "vendor", name: "Arian" });
    expect(text).toContain(applicantLoginUrl("vendor"));
    expect(text).toContain("পাসওয়ার্ড ভুলে গেছেন?");
    expect(text).toContain("২৪ ঘণ্টা");
    expect(text).not.toMatch(/[0-9]{2} ?h/);
  });

  it("carries the staff note on a rejection, with a fallback", () => {
    expect(resetRejectedMessage({ kind: "rider", name: "T", note: "ফোনে মেলেনি" })).toContain("কারণ: ফোনে মেলেনি");
    expect(resetRejectedMessage({ kind: "rider", name: "T" })).toContain("আবার অনুরোধ");
  });

  it("links wa.me for a BD mobile only", () => {
    expect(resetApprovedWhatsAppLink({ kind: "rider", name: "T", phone: "01811111111" })).toMatch(/^https:\/\/wa\.me\/8801811111111\?text=/);
    expect(resetApprovedWhatsAppLink({ kind: "rider", name: "T", phone: "" })).toBeNull();
  });
});
