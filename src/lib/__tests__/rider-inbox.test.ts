import { describe, expect, it } from "vitest";
import { parseAnnouncementInput, toInboxItems, UNREAD_WINDOW_MS, type AnnouncementRow } from "../rider-inbox";

const NOW = Date.parse("2026-10-02T10:00:00Z");
const row = (id: string, createdAt: string, extra: Partial<AnnouncementRow> = {}): AnnouncementRow => ({
  id, title: `t-${id}`, body: null, severity: null, rider_id: null, created_at: createdAt, expires_at: null, ...extra,
});

describe("toInboxItems", () => {
  it("sorts newest first, flags personal messages and defaults severity to info", () => {
    const out = toInboxItems([row("a", "2026-10-01T00:00:00Z"), row("b", "2026-10-02T00:00:00Z", { rider_id: "r1", severity: "important", body: "hi" })], null, NOW);
    expect(out.map((i) => i.id)).toEqual(["b", "a"]);
    expect(out[0]).toMatchObject({ personal: true, severity: "important", body: "hi" });
    expect(out[1]).toMatchObject({ personal: false, severity: "info", body: "" });
  });

  it("hides expired messages", () => {
    const out = toInboxItems([row("old", "2026-10-01T00:00:00Z", { expires_at: "2026-10-02T09:00:00Z" }), row("live", "2026-10-01T00:00:00Z", { expires_at: "2026-10-03T00:00:00Z" })], null, NOW);
    expect(out.map((i) => i.id)).toEqual(["live"]);
  });

  it("unread = newer than the read marker", () => {
    const out = toInboxItems([row("a", "2026-10-01T00:00:00Z"), row("b", "2026-10-02T08:00:00Z")], Date.parse("2026-10-02T00:00:00Z"), NOW);
    expect(out.find((i) => i.id === "a")?.unread).toBe(false);
    expect(out.find((i) => i.id === "b")?.unread).toBe(true);
  });

  it("with no marker only the last 14 days count as unread", () => {
    const stale = new Date(NOW - UNREAD_WINDOW_MS - 3_600_000).toISOString();
    const fresh = new Date(NOW - 3_600_000).toISOString();
    const out = toInboxItems([row("stale", stale), row("fresh", fresh)], null, NOW);
    expect(out.find((i) => i.id === "stale")?.unread).toBe(false);
    expect(out.find((i) => i.id === "fresh")?.unread).toBe(true);
  });
});

describe("parseAnnouncementInput", () => {
  it("cleans a valid post", () => {
    expect(parseAnnouncementInput({ title: "  Hello ", body: " x ", severity: "important", riderId: "", expiresHours: 24.7 })).toEqual({
      title: "Hello", body: "x", severity: "important", riderId: null, expiresHours: 24,
    });
  });
  it("rejects an empty or oversized title / body and a junk rider id", () => {
    expect("error" in parseAnnouncementInput({ title: "  " })).toBe(true);
    expect("error" in parseAnnouncementInput({ title: "x".repeat(121) })).toBe(true);
    expect("error" in parseAnnouncementInput({ title: "x", body: "y".repeat(1001) })).toBe(true);
    expect("error" in parseAnnouncementInput({ title: "x", riderId: "not-a-uuid" })).toBe(true);
    expect("error" in parseAnnouncementInput(null)).toBe(true);
  });
  it("unknown severity is info; bad / huge expiry is bounded", () => {
    expect(parseAnnouncementInput({ title: "x", severity: "zzz", expiresHours: -3 })).toMatchObject({ severity: "info", expiresHours: null });
    expect(parseAnnouncementInput({ title: "x", expiresHours: 99999 })).toMatchObject({ expiresHours: 24 * 90 });
  });
});
