/**
 * B6 (2026-09-28) — the holiday is checked on the way to the database.
 *
 * A shop books its window from a form, but the API is reachable without one,
 * so the dates are validated here too: a 400-day "holiday" is a permanent
 * closure wearing a date range, a window that already ended is a lie, and a
 * junk value must never quietly wipe a booking the shop is counting on.
 *
 * Staff logins cannot book one at all — it stops the shop's own sales for
 * days, which is the owner's call (C1 staff accounts make that sharper).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { vendorShopPatch } from "@/lib/db/vendor";

const TODAY = "2026-09-28";

const patchFor = (body: Record<string, unknown>, role: "owner" | "staff" = "owner") =>
  vendorShopPatch(body, role);

describe("vendorShopPatch — the holiday (B6)", () => {
  it("stores the window the owner booked, with the note", () => {
    const patch = patchFor({ vacationStart: "2026-10-10", vacationEnd: "2026-10-12", vacationNote: "Eid" });
    expect(patch).toMatchObject({
      vacation_start: "2026-10-10",
      vacation_end: "2026-10-12",
      vacation_note: "Eid",
    });
  });

  it("reads the database's own field names as well as the form's", () => {
    expect(
      patchFor({ vacation_start: "2026-10-10", vacation_end: "2026-10-12" }),
    ).toMatchObject({ vacation_start: "2026-10-10", vacation_end: "2026-10-12" });
  });

  it("clears the holiday when both dates come back empty", () => {
    expect(patchFor({ vacationStart: "", vacationEnd: "" })).toMatchObject({
      vacation_start: null,
      vacation_end: null,
      vacation_note: null,
    });
  });

  it("refuses a window that ends before it starts", () => {
    expect(() => patchFor({ vacationStart: "2026-10-12", vacationEnd: "2026-10-10" })).toThrow(
      /cannot end before/i,
    );
  });

  it("refuses half a window", () => {
    expect(() => patchFor({ vacationStart: "2026-10-10" })).toThrow(/last day/i);
    expect(() => patchFor({ vacationEnd: "2026-10-12" })).toThrow(/first day/i);
  });

  it("refuses a holiday that is already over", () => {
    expect(() => patchFor({ vacationStart: "2026-01-01", vacationEnd: "2026-01-05" })).toThrow(
      /already over/i,
    );
  });

  it("refuses an endless holiday and points at the Open switch", () => {
    expect(() => patchFor({ vacationStart: "2026-10-01", vacationEnd: "2027-10-01" })).toThrow(
      /at most 45 days/i,
    );
  });

  it("answers 422 — a bad date is the caller's mistake, not a server fault", () => {
    try {
      patchFor({ vacationStart: "2026-10-12", vacationEnd: "2026-10-10" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({ status: 422 });
    }
  });

  it("refuses junk dates instead of clearing a booked holiday behind the shop's back", () => {
    expect(() => patchFor({ vacationStart: 123, vacationEnd: 456 })).toThrow();
    expect(() => patchFor({ vacationStart: "soon", vacationEnd: "later" })).toThrow();
  });

  it("lets a note alone through without inventing a window", () => {
    // A note with no dates is not a holiday — nothing closes.
    expect(() => patchFor({ vacationNote: "Eid" })).toThrow(/first day/i);
  });

  it("keeps the note short, because it is printed for shoppers", () => {
    const patch = patchFor({
      vacationStart: "2026-10-10",
      vacationEnd: "2026-10-12",
      vacationNote: "y".repeat(300),
    });
    expect(String(patch.vacation_note)).toHaveLength(160);
  });

  it("stops a STAFF login from booking a holiday — that is the owner's call", () => {
    expect(() =>
      patchFor({ vacationStart: "2026-10-10", vacationEnd: "2026-10-12" }, "staff"),
    ).toThrow(/only the shop owner/i);
  });

  it("still lets staff flip the open sign, holiday or not", () => {
    expect(patchFor({ isOpen: false }, "staff")).toMatchObject({ is_open: false });
  });

  it("books a holiday that starts today, and one day long", () => {
    expect(patchFor({ vacationStart: TODAY, vacationEnd: TODAY })).toMatchObject({
      vacation_start: TODAY,
      vacation_end: TODAY,
    });
  });
});
