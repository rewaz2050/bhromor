import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  legacyTrackTokensAccepted,
  trackTokenFor,
  trackTokenTtlHours,
  verifyTrackToken,
} from "../track-token";

/**
 * Security 2026-10-14 H3: the `t` parameter on every tracker link is an
 * HMAC-SHA256 of the order ref + normalized phone, truncated to 24 hex
 * chars (96 bits). It is the third factor beside the guessable order
 * number and the often-public phone.
 */

const OLD = { ...process.env };

beforeEach(() => {
  process.env.TRACK_TOKEN_SECRET = "test-secret-round-2";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.TRACK_TOKEN_TTL_HOURS;
  delete process.env.TRACK_TOKEN_REVOKE_LEGACY;
});

afterEach(() => {
  process.env.TRACK_TOKEN_SECRET = OLD.TRACK_TOKEN_SECRET;
  if (OLD.TRACK_TOKEN_TTL_HOURS === undefined)
    delete process.env.TRACK_TOKEN_TTL_HOURS;
  else process.env.TRACK_TOKEN_TTL_HOURS = OLD.TRACK_TOKEN_TTL_HOURS;
  if (OLD.TRACK_TOKEN_REVOKE_LEGACY === undefined)
    delete process.env.TRACK_TOKEN_REVOKE_LEGACY;
  else process.env.TRACK_TOKEN_REVOKE_LEGACY = OLD.TRACK_TOKEN_REVOKE_LEGACY;
  if (OLD.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = OLD.SUPABASE_SERVICE_ROLE_KEY;
  }
});

describe("trackTokenFor", () => {
  it("signs a stable 24-hex token per (ref, phone)", () => {
    const t = trackTokenFor("PS-20260924-0007", "01712345678");
    expect(t).toMatch(/^[0-9a-f]{24}$/);
    expect(trackTokenFor("PS-20260924-0007", "01712345678")).toBe(t);
  });

  it("normalizes the ref case and the phone format into one token", () => {
    const a = trackTokenFor("ps-20260924-0007", "01712345678");
    const b = trackTokenFor("  PS-20260924-0007  ", "+8801712345678");
    expect(a).toBe(b);
  });

  it("refuses to sign empty inputs", () => {
    expect(trackTokenFor("", "01712345678")).toBe("");
    expect(trackTokenFor("PS-1", "")).toBe("");
    expect(trackTokenFor("PS-1", null)).toBe("");
  });

  it("changes with the key material", () => {
    const a = trackTokenFor("PS-1", "01712345678");
    process.env.TRACK_TOKEN_SECRET = "another-secret";
    expect(trackTokenFor("PS-1", "01712345678")).not.toBe(a);
  });
});

describe("verifyTrackToken", () => {
  it("accepts the token the server would have put on the link", () => {
    const t = trackTokenFor("PS-20260924-0007", "01712345678");
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", t)).toBe(true);
    // Link values may arrive uppercased or padded — still accepted.
    expect(
      verifyTrackToken(
        "ps-20260924-0007",
        "+8801712345678",
        ` ${t.toUpperCase()} `,
      ),
    ).toBe(true);
  });

  it("rejects a token presented with the wrong phone or ref", () => {
    const t = trackTokenFor("PS-20260924-0007", "01712345678");
    expect(verifyTrackToken("PS-20260924-0007", "01812345678", t)).toBe(false);
    expect(verifyTrackToken("PS-20260924-0008", "01712345678", t)).toBe(false);
  });

  it("rejects garbage, truncation and absence", () => {
    const t = trackTokenFor("PS-20260924-0007", "01712345678");
    expect(
      verifyTrackToken("PS-20260924-0007", "01712345678", t.slice(0, 23)),
    ).toBe(false);
    expect(
      verifyTrackToken("PS-20260924-0007", "01712345678", "z".repeat(24)),
    ).toBe(false);
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", null)).toBe(
      false,
    );
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", "")).toBe(false);
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", `${t}00`)).toBe(
      false,
    );
  });

  it("rejects everything when the pair cannot be signed", () => {
    expect(verifyTrackToken("", "01712345678", "a".repeat(24))).toBe(false);
    expect(verifyTrackToken("PS-1", "", "a".repeat(24))).toBe(false);
  });
});

/**
 * Expiry (2026-10-27). Default behaviour must not change: an app with no
 * configuration keeps minting and accepting the same 24-hex v1 token.
 */
describe("track token expiry and revocation", () => {
  it("stays on the timeless v1 format until a lifetime is configured", () => {
    expect(trackTokenTtlHours()).toBe(0);
    expect(trackTokenFor("PS-1", "01712345678")).toMatch(/^[0-9a-f]{24}$/);
    expect(legacyTrackTokensAccepted()).toBe(true);
  });

  it("mints a timestamped v2 token that verifies, and survives case/space", () => {
    process.env.TRACK_TOKEN_TTL_HOURS = "24";
    const now = Date.UTC(2026, 9, 27, 12, 0, 0);
    const t = trackTokenFor("PS-20260924-0007", "01712345678", now);
    expect(t).toMatch(/^2\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-f]{24}$/);
    expect(trackTokenFor("PS-20260924-0007", "01712345678", now)).toBe(t);
    expect(
      verifyTrackToken(
        "ps-20260924-0007",
        "+8801712345678",
        ` ${t.toUpperCase()} `,
        now,
      ),
    ).toBe(true);
    expect(verifyTrackToken("PS-20260924-0007", "01812345678", t, now)).toBe(
      false,
    );
  });

  it("expires a v2 token after its lifetime, and refuses a tampered timestamp", () => {
    process.env.TRACK_TOKEN_TTL_HOURS = "1";
    const issued = Date.UTC(2026, 9, 27, 9, 0, 0);
    const t = trackTokenFor("PS-1", "01712345678", issued);
    expect(
      verifyTrackToken("PS-1", "01712345678", t, issued + 59 * 60_000),
    ).toBe(true);
    expect(
      verifyTrackToken("PS-1", "01712345678", t, issued + 61 * 60_000),
    ).toBe(false);
    // Moving the timestamp forward without the key cannot extend the token.
    const [prefix, , mac] = t.split(".");
    const moved = `${prefix}.${Math.floor((issued + 3_600_000) / 1000).toString(36)}.${mac}`;
    expect(
      verifyTrackToken("PS-1", "01712345678", moved, issued + 3_600_000),
    ).toBe(false);
    // A token dated far in the future is refused (clock-skew guard).
    const early = trackTokenFor("PS-1", "01712345678", issued + 86_400_000);
    expect(verifyTrackToken("PS-1", "01712345678", early, issued)).toBe(false);
  });

  it("rejects legacy tokens only when the operator revokes them", () => {
    const legacy = trackTokenFor("PS-1", "01712345678");
    expect(verifyTrackToken("PS-1", "01712345678", legacy)).toBe(true);
    process.env.TRACK_TOKEN_REVOKE_LEGACY = "1";
    expect(legacyTrackTokensAccepted()).toBe(false);
    expect(verifyTrackToken("PS-1", "01712345678", legacy)).toBe(false);
    // v2 still works while legacy is revoked.
    process.env.TRACK_TOKEN_TTL_HOURS = "24";
    const now = Date.UTC(2026, 9, 27, 12, 0, 0);
    expect(
      verifyTrackToken(
        "PS-1",
        "01712345678",
        trackTokenFor("PS-1", "01712345678", now),
        now,
      ),
    ).toBe(true);
  });

  it("keeps a minted lifetime through later configuration changes", () => {
    process.env.TRACK_TOKEN_TTL_HOURS = "1";
    const issued = Date.UTC(2026, 9, 27, 9, 0, 0);
    const t = trackTokenFor("PS-1", "01712345678", issued);
    delete process.env.TRACK_TOKEN_TTL_HOURS; // operator removes the switch
    expect(
      verifyTrackToken("PS-1", "01712345678", t, issued + 59 * 60_000),
    ).toBe(true);
    expect(
      verifyTrackToken("PS-1", "01712345678", t, issued + 61 * 60_000),
    ).toBe(false);
    process.env.TRACK_TOKEN_TTL_HOURS = "8760"; // …or raises it
    expect(
      verifyTrackToken("PS-1", "01712345678", t, issued + 61 * 60_000),
    ).toBe(false);
  });

  it("ignores junk configuration instead of guessing", () => {
    process.env.TRACK_TOKEN_TTL_HOURS = "not-a-number";
    expect(trackTokenTtlHours()).toBe(0);
    expect(trackTokenFor("PS-1", "01712345678")).toMatch(/^[0-9a-f]{24}$/);
    process.env.TRACK_TOKEN_TTL_HOURS = "-5";
    expect(trackTokenTtlHours()).toBe(0);
  });
});
