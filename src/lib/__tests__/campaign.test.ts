import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_DEFAULTS,
  campaignMatchesProduct,
  campaignStateFor,
  campaignUsable,
  campaignView,
  dhakaDayEndMs,
  dhakaDayStartMs,
  sanitizeCampaign,
  type CampaignConfig,
} from "../campaign";

const cfg = (over: Partial<CampaignConfig> = {}): CampaignConfig => ({
  ...CAMPAIGN_DEFAULTS,
  enabled: true,
  startDate: "2026-04-15",
  endDate: "2026-04-18",
  title: "Eid 2026 Drop",
  ...over,
});

describe("campaign date windows — Asia/Dhaka days, inclusive", () => {
  it("parses a Dhaka day to its exact instants (UTC+6, no DST)", () => {
    // 2026-04-15 00:00 Asia/Dhaka = 2026-04-14 18:00 UTC
    expect(dhakaDayStartMs("2026-04-15")).toBe(Date.UTC(2026, 3, 15) - 6 * 3600_000);
    expect(dhakaDayEndMs("2026-04-15")).toBe(dhakaDayStartMs("2026-04-15")! + 86_400_000 - 1);
  });

  it("refuses dates that could not exist", () => {
    expect(dhakaDayStartMs("2026-02-30")).toBeNull();
    expect(dhakaDayStartMs("15-04-2026")).toBeNull();
    expect(dhakaDayStartMs("")).toBeNull();
    expect(dhakaDayStartMs(undefined)).toBeNull();
  });
});

describe("campaignStateFor — the only state machine the page may render", () => {
  it("is 'off' unless enabled with a usable window", () => {
    expect(campaignStateFor(CAMPAIGN_DEFAULTS, 0)).toBe("off");
    expect(campaignStateFor(cfg({ enabled: false }), Date.UTC(2026, 3, 16))).toBe("off");
    expect(campaignStateFor(cfg({ endDate: "broken" }), Date.UTC(2026, 3, 16))).toBe("off");
  });

  it("teases before the first day, runs through the last, then ends", () => {
    const before = dhakaDayStartMs("2026-04-15")! - 1;
    const first = dhakaDayStartMs("2026-04-15")!;
    const lastNight = dhakaDayEndMs("2026-04-18")!;
    const after = lastNight + 1;
    expect(campaignStateFor(cfg(), before)).toBe("teaser");
    expect(campaignStateFor(cfg(), first)).toBe("live");
    expect(campaignStateFor(cfg(), lastNight)).toBe("live"); // inclusive last day
    expect(campaignStateFor(cfg(), after)).toBe("ended");
  });

  it("single-day campaigns still work (start = end)", () => {
    const one = cfg({ startDate: "2026-04-15", endDate: "2026-04-15" });
    expect(campaignUsable(one)).toBe(true);
    expect(campaignStateFor(one, firstInstant(one))).toBe("live");
    function firstInstant(c: CampaignConfig): number {
      return dhakaDayStartMs(c.startDate)!;
    }
  });
});

describe("campaignView — what the storefront is allowed to show", () => {
  it("carries a countdown target only while it means something", () => {
    const before = dhakaDayStartMs("2026-04-15")! - 1000;
    const live = dhakaDayStartMs("2026-04-16")!;
    const ended = dhakaDayEndMs("2026-04-18")! + 1000;
    const c = cfg({ titleBn: "ঈদ ২০২৬", productIds: ["abc", "heritage-green-panjabi"] });
    const teaser = campaignView(c, before);
    expect(teaser.startsAtMs).toBe(dhakaDayStartMs("2026-04-15"));
    expect(teaser.endsAtMs).toBeNull(); // no fake "ends in" during the teaser
    const liveView = campaignView(c, live);
    expect(liveView.endsAtMs).toBe(dhakaDayEndMs("2026-04-18"));
    const done = campaignView(c, ended);
    expect(done.startsAtMs).toBeNull();
    expect(done.endsAtMs).toBeNull();
    expect(done.productIds).toEqual([]); // after the drop, no "shop the picks" rail
  });

  it("hides everything when the campaign is off — never a shell of copy", () => {
    const v = campaignView(cfg({ enabled: false }), Date.UTC(2026, 3, 16));
    expect(v.state).toBe("off");
    expect(v.title).toBe("");
    expect(v.productIds).toEqual([]);
  });
});

describe("sanitizeCampaign — the editor's word, not the internet's", () => {
  it("disarms a campaign whose window cannot exist", () => {
    expect(sanitizeCampaign(cfg({ startDate: "2026-04-18", endDate: "2026-04-15" })).enabled).toBe(
      false,
    );
    expect(sanitizeCampaign(cfg({ startDate: "garbage" })).enabled).toBe(false);
    expect(sanitizeCampaign(cfg({ startDate: "2026-02-31" })).startDate).toBe("");
  });

  it("normalises ids, caps the list and keeps copy bounded", () => {
    const out = sanitizeCampaign({
      enabled: true,
      startDate: "2026-04-15",
      endDate: "2026-04-18",
      title: "  Eid 2026 Drop  ",
      subtitle: "x".repeat(500),
      productIds: [" P1 ", "p1", "", 42, "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "p14"],
    });
    expect(out.title).toBe("Eid 2026 Drop");
    expect(out.subtitle.length).toBe(300);
    expect(out.productIds).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"]);
  });

  it("round-trips a valid config untouched", () => {
    const c = cfg({ earlyAccess: false, expressNote: "Eid Eve: 60-min express till 9PM" });
    expect(sanitizeCampaign(c)).toEqual(c);
  });
});

describe("campaignMatchesProduct — ids or slugs, like the flash scope", () => {
  const view = { ...campaignView(cfg({ productIds: ["P1", "Heritage-Green-Panjabi" ] })), };
  it("matches case-insensitively on either key", () => {
    expect(
      campaignMatchesProduct({ ...view, productIds: ["abc123"] }, { id: "abc123", slug: "x" }),
    ).toBe(true);
    expect(
      campaignMatchesProduct({ ...view, productIds: ["heritage-green-panjabi"] }, { id: "z", slug: "Heritage-Green-Panjabi" }),
    ).toBe(true);
    expect(campaignMatchesProduct({ ...view, productIds: [] }, { id: "abc", slug: "x" })).toBe(false);
  });
});
