import { describe, expect, it } from "vitest";

import {
  PLUS_DEFAULTS,
  PLUS_MONTH_MS,
  membershipPhoneKey,
  membershipStateFor,
  plusActiveOf,
  plusAmountPaisa,
  sanitizePlus,
  type MembershipRow,
} from "../membership";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 15, 10, 0, 0); // fixed clock — no flake

const row = (over: Partial<MembershipRow>): MembershipRow => ({
  phone: "01712345678",
  status: "active",
  expiresAt: NOW + 5 * DAY,
  ...over,
});

describe("membershipStateFor — the one gate every surface shares", () => {
  it("no rows → none", () => {
    expect(membershipStateFor([], NOW)).toEqual({ state: "none", expiresAt: null });
  });

  it("active row with future expiry → active, carrying the date", () => {
    const exp = NOW + 3 * DAY;
    expect(membershipStateFor([row({ expiresAt: exp })], NOW)).toEqual({
      state: "active",
      expiresAt: exp,
    });
  });

  it("active but PAST expiry is expired, not active — the date is kept for the renew CTA", () => {
    expect(membershipStateFor([row({ expiresAt: NOW - 1000 })], NOW)).toEqual({
      state: "expired",
      expiresAt: NOW - 1000,
    });
    // exactly at expiry the term is over (strict >)
    expect(membershipStateFor([row({ expiresAt: NOW })], NOW).state).toBe("expired");
  });

  it("the FURTHEST active expiry wins (stacked renewals)", () => {
    const a = membershipStateFor(
      [row({ expiresAt: NOW + 10 * DAY }), row({ expiresAt: NOW + 40 * DAY })],
      NOW,
    );
    expect(a).toEqual({ state: "active", expiresAt: NOW + 40 * DAY });
  });

  it("pending alone → pending; pending next to an ACTIVE term still shows active", () => {
    expect(membershipStateFor([row({ status: "pending", expiresAt: null })], NOW).state).toBe(
      "pending",
    );
    const active = row({ expiresAt: NOW + DAY });
    expect(
      membershipStateFor([active, row({ status: "pending", expiresAt: null })], NOW).state,
    ).toBe("active");
  });

  it("a lapsed term + a waiting application reads as pending (renewal in review beats the old date)", () => {
    const out = membershipStateFor(
      [row({ status: "active", expiresAt: NOW - DAY }), row({ status: "pending", expiresAt: null })],
      NOW,
    );
    expect(out.state).toBe("pending");
    expect(out.expiresAt).toBe(NOW - DAY);
  });

  it("rejected alone → rejected; rejected + later pending → pending", () => {
    expect(membershipStateFor([row({ status: "rejected", expiresAt: null })], NOW).state).toBe(
      "rejected",
    );
    expect(
      membershipStateFor(
        [row({ status: "rejected", expiresAt: null }), row({ status: "pending", expiresAt: null })],
        NOW,
      ).state,
    ).toBe("pending");
  });

  it("active row with a null expiry is treated as no membership at all (can't be trusted)", () => {
    expect(membershipStateFor([row({ expiresAt: null })], NOW).state).toBe("none");
  });
});

describe("phone key — one identity for +880/88001/017 forms", () => {
  it.each([
    ["+880 1712-345678", "01712345678"],
    ["8801712345678", "01712345678"],
    ["01712345678", "01712345678"],
    ["  01712 345678  ", "01712345678"],
  ])("%s → %s", (input, want) => {
    expect(membershipPhoneKey(input)).toBe(want);
  });

  it.each(["0171234", "not-a-phone", "", "12345678901"])(
    "junk (%s) keys to null — never a row",
    (input) => {
      expect(membershipPhoneKey(input)).toBeNull();
    },
  );

  it("non-strings key to null", () => {
    expect(membershipPhoneKey(42)).toBeNull();
    expect(membershipPhoneKey(null)).toBeNull();
  });
});

describe("pricing + config", () => {
  it("defaults to ৳99/month", () => {
    expect(PLUS_DEFAULTS.pricePaisa).toBe(9900);
  });

  it("months clamp to 1..12 and floor (6.9 months is six months of money)", () => {
    const cfg = { enabled: true, pricePaisa: 1000 };
    expect(plusAmountPaisa(cfg, 0)).toBe(1000);
    expect(plusAmountPaisa(cfg, -4)).toBe(1000);
    expect(plusAmountPaisa(cfg, 13)).toBe(12 * 1000);
    expect(plusAmountPaisa(cfg, 6.9)).toBe(6 * 1000);
    expect(plusAmountPaisa(cfg, Number.NaN)).toBe(1000);
  });

  it("sanitizePlus keeps money in a sane band and enabled strictly boolean", () => {
    expect(sanitizePlus(undefined)).toEqual(PLUS_DEFAULTS);
    expect(sanitizePlus({ pricePaisa: 1 }).pricePaisa).toBe(100); // never free
    expect(sanitizePlus({ pricePaisa: 99_999_999 }).pricePaisa).toBe(100_000_00); // ≤৳1M
    expect(sanitizePlus({ enabled: "yes", pricePaisa: 9900 }).enabled).toBe(true); // default, not coercion
    expect(sanitizePlus({ enabled: false }).enabled).toBe(false);
  });

  it("a month is exactly 30 days — the same constant the approve path uses", () => {
    expect(PLUS_MONTH_MS).toBe(30 * 86_400_000);
  });
});

describe("plusActiveOf — the checkout/RPC mirror over raw rows", () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  it("active + future is the ONLY true", () => {
    expect(plusActiveOf([{ status: "active", expires_at: iso(NOW + DAY) }], NOW)).toBe(true);
    expect(plusActiveOf([{ status: "active", expires_at: iso(NOW - 1) }], NOW)).toBe(false);
    expect(plusActiveOf([{ status: "active", expires_at: null }], NOW)).toBe(false);
    expect(plusActiveOf([{ status: "pending", expires_at: iso(NOW + DAY) }], NOW)).toBe(false);
    expect(plusActiveOf([], NOW)).toBe(false);
  });
});
