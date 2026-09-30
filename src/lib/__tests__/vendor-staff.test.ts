/**
 * C1 (2026-09-28) — the rules a staff login is opened under.
 *
 * The sharp edge is the login box: a shop assistant often has no e-mail at
 * all, so a mobile number has to work as a first-class login (it becomes a
 * synthetic address, nothing is ever sent to it). Everything else here is
 * about refusing to hand a login to nobody in particular — an unnamed row is
 * a key with no name on it.
 */
import { describe, expect, it } from "vitest";
import {
  VENDOR_STAFF_MAX,
  staffAddedOn,
  staffHandle,
  staffLoginLabel,
  staffSlotsLeft,
  validateStaffInput,
  type VendorStaffMember,
} from "@/lib/vendor-staff";

const member = (over: Partial<VendorStaffMember> = {}): VendorStaffMember => ({
  userId: "u1",
  name: "Samina",
  handle: "01711111111",
  loginEmail: "01711111111@phone.prosanti.app",
  role: "staff",
  ...over,
});

describe("validateStaffInput", () => {
  it("takes a mobile number — most shop assistants have no e-mail", () => {
    const out = validateStaffInput({ name: "Samina Akter", login: "017 1234 5678" });
    expect(out.ok).toBe(true);
    expect(out.value).toEqual({
      name: "Samina Akter",
      email: "01712345678@phone.prosanti.app",
      phone: "01712345678",
    });
  });

  it("takes an e-mail just as happily", () => {
    const out = validateStaffInput({ name: "Rafiq", login: "Rafiq@Shop.example" });
    expect(out.ok).toBe(true);
    expect(out.value.email).toBe("rafiq@shop.example");
    expect(out.value.phone).toBeNull();
  });

  it("accepts Bangla digits, because that is how a number gets typed", () => {
    const out = validateStaffInput({ name: "রফিক", login: "০১৭১২৩৪৫৬৭৮" });
    expect(out.ok).toBe(true);
    expect(out.value.phone).toBe("01712345678");
  });

  it("refuses a login that is neither a number nor an e-mail", () => {
    for (const login of ["", "   ", "shop", "12345", "017123", "a@b", "not an email"]) {
      const out = validateStaffInput({ name: "Samina", login });
      expect(out.ok).toBe(false);
      expect(out.errors.login).toMatch(/mobile number|email/i);
    }
  });

  it("refuses an unnamed login — a key with no name on it", () => {
    const out = validateStaffInput({ name: "S", login: "01712345678" });
    expect(out.ok).toBe(false);
    expect(out.errors.name).toMatch(/type their name/i);
  });

  it("trims the name and keeps it short", () => {
    const out = validateStaffInput({ name: `  ${"x".repeat(200)}  `, login: "01712345678" });
    expect(out.value.name).toHaveLength(60);
  });

  it("reads the form's other spellings too", () => {
    expect(validateStaffInput({ display_name: "Samina", loginEmail: "01712345678" }).ok).toBe(true);
  });

  it("never throws on garbage — it answers with errors", () => {
    for (const raw of [null, undefined, 42, "nope", { name: 1, login: {} }]) {
      expect(() => validateStaffInput(raw)).not.toThrow();
      expect(validateStaffInput(raw).ok).toBe(false);
    }
  });
});

describe("the roster's copy", () => {
  it("says a phone login is a phone login, not an address", () => {
    expect(staffLoginLabel("01711111111@phone.prosanti.app")).toBe("01711111111 (phone login)");
    expect(staffLoginLabel("samina@example.com")).toBe("samina@example.com");
    expect(staffLoginLabel(null)).toBe("no email");
  });

  it("hands back what the person should TYPE, not what we store", () => {
    expect(staffHandle("01711111111@phone.prosanti.app")).toBe("01711111111");
    expect(staffHandle("samina@example.com")).toBe("samina@example.com");
  });

  it("dates a row plainly, and says nothing when the row has no date", () => {
    expect(staffAddedOn(Date.parse("2026-10-12T00:00:00Z"))).toBe("12 Oct");
    expect(staffAddedOn(null)).toBe("");
    expect(staffAddedOn(0)).toBe("");
  });
});

describe("staffSlotsLeft — the cap", () => {
  it("counts only staff, because owners are not part of the cap", () => {
    const roster = [
      member({ userId: "o1", role: "owner" }),
      member({ userId: "s1" }),
      member({ userId: "s2" }),
    ];
    expect(staffSlotsLeft(roster)).toBe(VENDOR_STAFF_MAX - 2);
  });

  it("never goes negative", () => {
    const full = Array.from({ length: 9 }, (_, i) => member({ userId: `s${i}` }));
    expect(staffSlotsLeft(full)).toBe(0);
  });

  it(`opens ${VENDOR_STAFF_MAX} logins and no more`, () => {
    const five = Array.from({ length: VENDOR_STAFF_MAX }, (_, i) => member({ userId: `s${i}` }));
    expect(staffSlotsLeft(five)).toBe(0);
    expect(staffSlotsLeft(five.slice(0, 4))).toBe(1);
  });
});
