import { describe, expect, it } from "vitest";
import {
  EXPORT_KINDS, EXPORT_SPECS, dhakaStamp, exportCsv, exportFilename, parseExportKind, parseExportRange, type ExportLookups,
} from "../money-export";

// 2026-10-02 12:00 Dhaka
const NOW = Date.parse("2026-10-02T06:00:00Z");

describe("parseExportRange", () => {
  it("defaults to the last 30 Dhaka days ending today, as UTC instants of Dhaka midnight", () => {
    const r = parseExportRange(null, null, NOW);
    expect(r).toEqual({ ok: true, range: { from: "2026-09-03", to: "2026-10-02", fromIso: "2026-09-03T00:00:00+06:00", toIso: "2026-10-03T00:00:00+06:00" } });
  });
  it("keeps an explicit window inclusive of both ends", () => {
    const r = parseExportRange("2026-09-01", "2026-09-30", NOW);
    expect(r.ok && r.range).toMatchObject({ from: "2026-09-01", to: "2026-09-30", toIso: "2026-10-01T00:00:00+06:00" });
  });
  it("clamps a future end to today", () => {
    const r = parseExportRange("2026-09-30", "2027-01-01", NOW);
    expect(r.ok && r.range.to).toBe("2026-10-02");
  });
  it.each([
    ["2026-13-01", "2026-09-30", /start date is not a valid/],
    ["2026-09-01", "nope", /end date is not a valid/],
    ["2026-02-30", null, /start date is not a valid/],
    ["2026-10-02", "2026-09-01", /after the end/],
    ["2025-01-01", "2026-09-30", /at most 366/],
  ])("refuses %s → %s instead of guessing", (from, to, msg) => {
    const r = parseExportRange(from, to, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(msg);
  });
  it("allows exactly 366 days", () => {
    expect(parseExportRange("2025-10-02", "2026-10-02", NOW).ok).toBe(true);
  });
});

describe("parseExportKind / filename / stamp", () => {
  it("accepts only known ledgers", () => {
    expect(EXPORT_KINDS.every((k) => parseExportKind(k) === k)).toBe(true);
    expect(parseExportKind("users")).toBeNull();
    expect(parseExportKind(null)).toBeNull();
  });
  it("names the file by ledger and period", () => {
    const r = parseExportRange("2026-09-01", "2026-09-30", NOW);
    if (!r.ok) throw new Error("range");
    expect(exportFilename("rider_wallet", r.range)).toBe("prosanti-rider-wallet-2026-09-01_to_2026-09-30.csv");
  });
  it("shows Dhaka wall-clock time whatever the server zone", () => {
    expect(dhakaStamp("2026-10-01T20:30:00Z")).toBe("2026-10-02 02:30");
    expect(dhakaStamp("garbage")).toBe("");
    expect(dhakaStamp(null)).toBe("");
  });
});

const lookups: ExportLookups = {
  riders: new Map([["r1", { name: "Rafiq, \"Raf\"", phone: "01711111111" }]]),
  shops: new Map([["s1", "Green Shop"]]),
  orders: new Map([["o1", "PS-1001"]]),
};

describe("exportCsv", () => {
  it("starts with a BOM and the header, CRLF lines, taka with two decimals, signed", () => {
    const csv = exportCsv("rider_wallet", [
      { id: "e1", rider_id: "r1", order_id: "o1", kind: "delivery_fee", amount: 4000, note: "", created_at: "2026-10-01T20:30:00Z" },
      { id: "e2", rider_id: "r1", order_id: null, kind: "payout", amount: -123456, note: "bKash", created_at: "2026-10-02T04:00:00Z" },
    ], lookups);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(EXPORT_SPECS.rider_wallet.header.join(","));
    expect(lines[1]).toBe('2026-10-02 02:30,"Rafiq, ""Raf""",01711111111,delivery_fee,PS-1001,40.00,,e1');
    expect(lines[2]).toContain("payout,,-1234.56,bKash,e2");
    expect(lines[3]).toBe("");
  });

  it("neutralises a spreadsheet formula typed into a free-text field", () => {
    const csv = exportCsv("rider_wallet", [{ id: "e", rider_id: "r1", order_id: null, kind: "adjustment", amount: 100, note: "=HYPERLINK(\"evil\")", created_at: "2026-10-01T00:00:00Z" }], lookups);
    expect(csv).toContain("\"'=HYPERLINK(");
  });

  it("shop ledger: subtotal, commission, payable with shop + order names", () => {
    const csv = exportCsv("shop_ledger", [{ id: "l1", shop_id: "s1", order_id: "o1", subtotal: 100000, commission: 10000, payable: 90000, created_at: "2026-10-01T00:00:00Z" }], lookups);
    expect(csv).toContain("2026-10-01 06:00,Green Shop,PS-1001,1000.00,100.00,900.00,l1");
  });

  it("audit: friendly event name, signed amount and the one-line detail", () => {
    const csv = exportCsv("audit", [
      { id: "a1", at: "2026-10-01T00:00:00Z", actor_email: "boss@x.test", event: "rider_adjustment", subject_type: "rider", subject_id: "r1", amount: -1500, detail: { kind: "adjustment", note: "Damaged parcel" } },
      { id: "a2", at: "2026-10-01T00:00:00Z", actor_email: null, event: "mystery", subject_type: "x", subject_id: null, amount: null, detail: null },
    ], lookups);
    expect(csv).toContain("boss@x.test,Rider wallet adjustment,rider,r1,-15.00,adjustment · Damaged parcel,a1");
    expect(csv).toContain(",mystery,x,,,,a2");
  });

  it("payouts and settlements carry rider + status columns; unknown ids stay blank, never crash", () => {
    const p = exportCsv("rider_payouts", [{ id: "p1", rider_id: "gone", amount: 5000, method: "bkash", account: "017", status: "paid", requested_at: "2026-10-01T00:00:00Z", decided_at: null, decided_by_email: null, reference: "TX1", note: null }], lookups);
    expect(p).toContain("2026-10-01 06:00,,,50.00,bkash,017,paid,,,TX1,,p1");
    const st = exportCsv("rider_settlements", [{ id: "t1", rider_id: "r1", amount: 20000, method: "cash", reference: "", settled_at: "2026-10-01T00:00:00Z" }], lookups);
    expect(st).toContain(",200.00,cash,,t1");
    expect(exportCsv("shop_payouts", [], lookups)).toBe("\uFEFF" + EXPORT_SPECS.shop_payouts.header.join(",") + "\r\n");
  });
});
