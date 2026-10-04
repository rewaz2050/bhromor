import { describe, expect, it } from "vitest";
import { AUDIT_EVENTS, AUDIT_EVENT_LABEL, describeAudit, parseAuditEvent, parseAuditLimit } from "../money-audit";

describe("money audit helpers (audit T)", () => {
  it("every event has a label", () => {
    for (const e of AUDIT_EVENTS) expect(AUDIT_EVENT_LABEL[e]).toBeTruthy();
  });

  it("parses the event filter strictly", () => {
    expect(parseAuditEvent("shop_payout")).toBe("shop_payout");
    expect(parseAuditEvent("drop table")).toBeNull();
    expect(parseAuditEvent(null)).toBeNull();
  });

  it("clamps the page size", () => {
    expect(parseAuditLimit(null)).toBe(50);
    expect(parseAuditLimit("9999")).toBe(200);
    expect(parseAuditLimit("-4")).toBe(1);
    expect(parseAuditLimit("abc")).toBe(50);
  });

  it("describes entries in one readable line", () => {
    expect(describeAudit({ event: "shop_payout", subjectId: "s", detail: { method: "bkash", reference: "SP-1" } })).toBe("BKASH · SP-1");
    expect(describeAudit({ event: "rider_settle", subjectId: "r", detail: { netted: 12000, reference: "visit" } })).toBe("netted 12000 paisa from wallet · visit");
    expect(describeAudit({ event: "rider_settle", subjectId: "r", detail: { netted: 0, reference: "" } })).toBe("");
    expect(describeAudit({ event: "rate_change", subjectId: "rider_base_fee_paisa", detail: { from: 4000, to: 5000 } })).toBe("rider_base_fee_paisa: 4000 → 5000 (paisa)");
    expect(describeAudit({ event: "wallet_numbers_changed", subjectId: "ops", detail: { methods: ["bkash", "nagad"] } })).toBe("methods: bkash, nagad");
  });
});
