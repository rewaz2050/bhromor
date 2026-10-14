import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trackTokenFor, verifyTrackToken } from "../track-token";

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
});

afterEach(() => {
  process.env.TRACK_TOKEN_SECRET = OLD.TRACK_TOKEN_SECRET;
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
    expect(verifyTrackToken("ps-20260924-0007", "+8801712345678", ` ${t.toUpperCase()} `)).toBe(true);
  });

  it("rejects a token presented with the wrong phone or ref", () => {
    const t = trackTokenFor("PS-20260924-0007", "01712345678");
    expect(verifyTrackToken("PS-20260924-0007", "01812345678", t)).toBe(false);
    expect(verifyTrackToken("PS-20260924-0008", "01712345678", t)).toBe(false);
  });

  it("rejects garbage, truncation and absence", () => {
    const t = trackTokenFor("PS-20260924-0007", "01712345678");
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", t.slice(0, 23))).toBe(false);
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", "z".repeat(24))).toBe(false);
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", null)).toBe(false);
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", "")).toBe(false);
    expect(verifyTrackToken("PS-20260924-0007", "01712345678", `${t}00`)).toBe(false);
  });

  it("rejects everything when the pair cannot be signed", () => {
    expect(verifyTrackToken("", "01712345678", "a".repeat(24))).toBe(false);
    expect(verifyTrackToken("PS-1", "", "a".repeat(24))).toBe(false);
  });
});
