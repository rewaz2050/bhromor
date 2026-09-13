import { describe, expect, it } from "vitest";
import {
  liveState,
  parseStreamUrl,
  validateLiveSessionInput,
} from "../live";

const DAY = 86_400_000;
const NOW = new Date("2026-09-14T15:00:00").getTime();
const IDS = new Set(["p1", "p2", "p3"]);

describe("liveState — the storefront shows what the shop tapped, not a timer", () => {
  it("scheduled stays upcoming even after its scheduled time", () => {
    expect(liveState({ status: "scheduled" })).toBe("upcoming");
  });
  it("live is live; ended is ended", () => {
    expect(liveState({ status: "live" })).toBe("live");
    expect(liveState({ status: "ended" })).toBe("ended");
  });
});

describe("parseStreamUrl — YouTube embeds, everything else is a watch link", () => {
  it("derives a youtubeId from every common YouTube form", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      expect(parseStreamUrl(url).youtubeId).toBe("dQw4w9WgXcQ");
    }
  });

  it("keeps non-YouTube links as-is with no youtubeId", () => {
    const fb = "https://www.facebook.com/prosanti/videos/123";
    expect(parseStreamUrl(fb)).toEqual({ url: fb, youtubeId: null });
  });

  it("blank in, null out", () => {
    expect(parseStreamUrl("")).toEqual({ url: "", youtubeId: null });
    expect(parseStreamUrl(undefined)).toEqual({ url: "", youtubeId: null });
    expect(parseStreamUrl("   ")).toEqual({ url: "", youtubeId: null });
  });
});

describe("validateLiveSessionInput", () => {
  const valid = (over: Partial<Parameters<typeof validateLiveSessionInput>[0]> = {}) =>
    validateLiveSessionInput(
      {
        title: "Eid collection on air",
        description: "New arrivals",
        streamUrl: "https://www.youtube.com/live/dQw4w9WgXcQ",
        startsAt: NOW + 3600_000,
        productIds: ["p1", "p2"],
        ...over,
      },
      IDS,
      NOW,
    );

  it("accepts a sane session and normalises the pieces in order", () => {
    const r = valid();
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual({
      title: "Eid collection on air",
      description: "New arrivals",
      streamUrl: "https://www.youtube.com/live/dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      startsAt: NOW + 3600_000,
      productIds: ["p1", "p2"],
    });
  });

  it("a session can be scheduled without a link yet — it just can't start one", () => {
    const r = valid({ streamUrl: "" });
    expect(r.errors).toEqual([]);
    expect(r.value?.streamUrl).toBe("");
    expect(r.value?.youtubeId).toBeNull();
  });

  it("refuses a too-short title, an unparseable link and a past-day start", () => {
    const r = valid({
      title: "ab",
      streamUrl: "not a url",
      startsAt: NOW - 2 * DAY,
    });
    expect(r.value).toBeUndefined();
    expect(r.errors.map((e) => e.field).sort()).toEqual([
      "startsAt",
      "streamUrl",
      "title",
    ]);
  });

  it("a slightly-past start is fine — shops start late all the time", () => {
    expect(valid({ startsAt: NOW - 2 * 3600_000 }).errors).toEqual([]);
  });

  it("drops duplicates and unknown ids, keeps order, caps at 30", () => {
    const r = valid({ productIds: ["p2", "p1", "p2", "nope", "p3"] });
    expect(r.errors.map((e) => e.field)).toEqual(["products"]);

    const many = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const r2 = validateLiveSessionInput(
      {
        title: "Long session",
        streamUrl: "",
        startsAt: NOW + DAY,
        productIds: many,
      },
      new Set(many),
      NOW,
    );
    expect(r2.errors).toEqual([]);
    expect(r2.value?.productIds).toHaveLength(30);
    expect(r2.value?.productIds[0]).toBe("p0");
  });

  it("an empty piece list is a field error, not a silent empty session", () => {
    const r = valid({ productIds: [] });
    expect(r.value).toBeUndefined();
    expect(r.errors).toEqual([
      {
        field: "products",
        message: "Pick at least one piece to show in the session.",
      },
    ]);
  });
});
