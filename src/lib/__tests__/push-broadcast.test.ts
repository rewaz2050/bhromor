import { describe, expect, it } from "vitest";
import {
  BROADCAST_MIN_GAP_MS,
  broadcastPayload,
  nextBroadcastAllowedAt,
  parseBroadcast,
  sanitizeBroadcastHref,
} from "../push-broadcast";

describe("push broadcast rules (UX plan §12)", () => {
  it("needs a title and a body in at least one language and fills the other", () => {
    expect(parseBroadcast({})).toMatchObject({ ok: false });
    expect(parseBroadcast({ titleBn: "ঈদ ড্রপ" })).toMatchObject({ ok: false });
    const bnOnly = parseBroadcast({ titleBn: "ঈদ ড্রপ", bodyBn: "আজ রাত ৯টা পর্যন্ত" });
    expect(bnOnly).toMatchObject({
      ok: true,
      draft: { title: "ঈদ ড্রপ", titleBn: "ঈদ ড্রপ", body: "আজ রাত ৯টা পর্যন্ত", bodyBn: "আজ রাত ৯টা পর্যন্ত", href: "/offers" },
    });
    const both = parseBroadcast({ title: "  Eid   drop ", titleBn: "ঈদ ড্রপ", body: "Tonight", bodyBn: "আজ", href: "/campaign" });
    expect(both).toMatchObject({ ok: true, draft: { title: "Eid drop", href: "/campaign" } });
  });

  it("caps lengths and keeps links on-site", () => {
    const long = "x".repeat(500);
    const r = parseBroadcast({ title: long, body: long });
    expect(r.ok && r.draft.title.length).toBe(60);
    expect(r.ok && r.draft.body.length).toBe(160);
    expect(sanitizeBroadcastHref("https://evil.example")).toBe("/offers");
    expect(sanitizeBroadcastHref("//evil.example")).toBe("/offers");
    expect(sanitizeBroadcastHref("/product/panjabi?x=1")).toBe("/product/panjabi?x=1");
    expect(sanitizeBroadcastHref("")).toBe("/offers");
  });

  it("speaks each device's language", () => {
    const r = parseBroadcast({ title: "Eid drop", titleBn: "ঈদ ড্রপ", body: "Tonight", bodyBn: "আজ রাতে" });
    if (!r.ok) throw new Error("expected ok");
    expect(broadcastPayload(r.draft, "bn")).toEqual({ title: "ঈদ ড্রপ", body: "আজ রাতে", href: "/offers" });
    expect(broadcastPayload(r.draft, "en")).toEqual({ title: "Eid drop", body: "Tonight", href: "/offers" });
  });

  it("opens the next slot exactly seven days after the last send", () => {
    const now = 1_000_000_000_000;
    expect(nextBroadcastAllowedAt(null, now)).toBeNull();
    expect(nextBroadcastAllowedAt(now - BROADCAST_MIN_GAP_MS, now)).toBeNull();
    expect(nextBroadcastAllowedAt(now - 3 * 86_400_000, now)).toBe(now + 4 * 86_400_000);
  });
});
