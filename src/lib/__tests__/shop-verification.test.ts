/**
 * B5 (2026-09-28) — what the badge means, in words a shopper and a shop can
 * both read.
 *
 * The failure mode being guarded against is a badge that flatters: a tick
 * printed from a stale date, a promise that says "verified" when only one of
 * the two documents was ever seen, or a shop that has simply not been
 * processed yet being labelled "unverified" in warning colours.
 */
import { describe, expect, it } from "vitest";
import {
  VERIFICATION_NOTE_MAX,
  actionFor,
  auditLine,
  isVerified,
  missingChecks,
  notCheckedLine,
  parseVerificationEvent,
  validateVerificationPatch,
  vendorVerificationLine,
  verificationActionLabel,
  verificationPromise,
  verifiedOnLabel,
} from "@/lib/shop-verification";
import type { ShopVerification } from "@/lib/catalog";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const DAYS = 86_400_000;

describe("isVerified — the badge follows the evidence", () => {
  it("needs BOTH documents and a stamp", () => {
    expect(isVerified({ nid: true, tradeLicence: true, verifiedAt: NOW })).toBe(true);
    expect(isVerified({ nid: true, tradeLicence: false, verifiedAt: NOW })).toBe(false);
    expect(isVerified({ nid: false, tradeLicence: true, verifiedAt: NOW })).toBe(false);
    // A stale stamp with a lifted check is not a badge (the DB clears these,
    // and the screen must not disagree with it).
    expect(isVerified({ nid: true, tradeLicence: false, verifiedAt: NOW })).toBe(false);
  });

  it("answers false for a shop with nothing recorded (a database without the migration)", () => {
    expect(isVerified(undefined)).toBe(false);
    expect(isVerified(null)).toBe(false);
    expect(isVerified({ nid: false, tradeLicence: false })).toBe(false);
  });

  it("says which document is still missing", () => {
    expect(missingChecks(undefined)).toEqual(["nid", "tradeLicence"]);
    expect(missingChecks({ nid: true, tradeLicence: false })).toEqual(["tradeLicence"]);
    expect(missingChecks({ nid: false, tradeLicence: true })).toEqual(["nid"]);
    expect(missingChecks({ nid: true, tradeLicence: true })).toEqual([]);
  });
});

describe("the words on the badge", () => {
  it("promises something specific, not a vague tick", () => {
    expect(verificationPromise()).toMatch(/ID and trade licence checked/i);
  });

  it("dates the check in plain language", () => {
    expect(verifiedOnLabel(NOW, NOW)).toMatch(/^Checked today \(28 Sep/);
    expect(verifiedOnLabel(NOW - DAYS, NOW)).toMatch(/^Checked yesterday \(27 Sep/);
    expect(verifiedOnLabel(NOW - 12 * DAYS, NOW)).toMatch(/^Checked 12 days ago \(16 Sep/);
    expect(verifiedOnLabel(NOW - 60 * DAYS, NOW)).toMatch(/^Checked 2 months ago \(30 Jul/);
    expect(verifiedOnLabel(NOW - 400 * DAYS, NOW)).toMatch(/^Checked 1 year ago \(24 Aug/);
  });

  it("describes an unchecked shop as not-yet-checked, never as suspect", () => {
    const line = notCheckedLine();
    expect(line).toMatch(/not checked/i);
    expect(line).not.toMatch(/unverified|fake|warning/i);
  });

  it("tells the shop itself what is missing, and what to do", () => {
    expect(vendorVerificationLine({ nid: true, tradeLicence: true, verifiedAt: NOW })).toMatch(
      /documents are checked/i,
    );
    const none = vendorVerificationLine(undefined);
    expect(none).toMatch(/National ID and trade licence/i);
    expect(none).toMatch(/has not checked your documents yet/i);
    expect(vendorVerificationLine({ nid: true, tradeLicence: false })).toMatch(/Trade licence/);
  });
});

describe("staff input", () => {
  it("takes only real booleans — a stray string is not a tick", () => {
    const checked = validateVerificationPatch({ nid: "yes", tradeLicence: true });
    expect(checked.value.nid).toBe(false);
    expect(checked.value.tradeLicence).toBe(true);
  });

  it("refuses an empty submission rather than silently clearing a badge", () => {
    const empty = validateVerificationPatch({ nid: false, tradeLicence: false, note: "   " });
    expect(empty.ok).toBe(false);
    expect(empty.error).toMatch(/tick what you checked/i);
    // A note on its own is a legitimate record.
    expect(validateVerificationPatch({ nid: false, tradeLicence: false, note: "licence expired" }).ok).toBe(true);
  });

  it("caps the private note", () => {
    const long = validateVerificationPatch({ nid: true, tradeLicence: true, note: "x".repeat(900) });
    expect(long.value.note).toHaveLength(VERIFICATION_NOTE_MAX);
  });

  it("survives junk", () => {
    for (const raw of [null, undefined, "x", 7, []]) {
      const checked = validateVerificationPatch(raw);
      expect(checked.ok).toBe(false);
      expect(checked.value).toEqual({ nid: false, tradeLicence: false, note: "" });
    }
  });
});

describe("the audit trail", () => {
  it("names the moment: verified / badge removed / note", () => {
    expect(
      actionFor(undefined, { nid: true, tradeLicence: true, note: "" }),
    ).toBe("verified");
    expect(
      actionFor({ nid: true, tradeLicence: true, verifiedAt: NOW }, { nid: false, tradeLicence: true, note: "" }),
    ).toBe("unverified");
    expect(
      actionFor({ nid: true, tradeLicence: true, verifiedAt: NOW }, { nid: true, tradeLicence: true, note: "re-checked" }),
    ).toBe("note");
    // Half a badge is not a badge: ticking one box alone is only a note.
    expect(
      actionFor(undefined, { nid: true, tradeLicence: false, note: "" }),
    ).toBe("note");
  });

  it("reads who did it and when", () => {
    const event = parseVerificationEvent({
      id: 3,
      shop_id: "s1",
      created_at: new Date(NOW - 3 * DAYS).toISOString(),
      action: "verified",
      nid_checked: true,
      trade_licence_checked: true,
      note: "NID + licence seen",
      actor_email: "staff@prosanti.example",
    });
    expect(event.action).toBe("verified");
    expect(event.note).toBe("NID + licence seen");
    const line = auditLine(event, NOW);
    expect(line).toContain("staff@prosanti.example");
    expect(line).toContain("3 days ago");
    expect(line).toContain(verificationActionLabel.verified);
  });

  it("coerces an unknown action to a note rather than inventing one", () => {
    expect(parseVerificationEvent({ action: "deleted-the-universe" }).action).toBe("note");
    expect(parseVerificationEvent({}).at).toBe(0);
    expect(parseVerificationEvent({ note: "" }).note).toBeNull();
  });
});

describe("the badge never claims more than the paperwork", () => {
  it("a verified shop's badge disappears the moment a check is lifted", () => {
    const full: ShopVerification = { nid: true, tradeLicence: true, verifiedAt: NOW };
    expect(isVerified(full)).toBe(true);
    const lifted: ShopVerification = { ...full, tradeLicence: false };
    expect(isVerified(lifted)).toBe(false);
    expect(missingChecks(lifted)).toEqual(["tradeLicence"]);
  });
});
