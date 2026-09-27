import { describe, expect, it } from "vitest";
import { heroCampaignCopy } from "../hero-campaign";
import { translations } from "@/lib/translations";

type K = Parameters<typeof heroCampaignCopy>[4] extends (k: infer X) => string ? X : never;
const tFor = (lang: "en" | "bn") => (k: K) => {
  const key = k.replace("home.", "") as keyof typeof translations.en.home;
  return translations[lang].home[key] as string;
};

const off = {
  state: "off",
  title: "",
  titleBn: "",
  subtitle: "",
  subtitleBn: "",
  startsAtMs: null,
  endsAtMs: null,
};
const eid = {
  ...off,
  title: "Eid Edit",
  titleBn: "ঈদ এডিট",
  subtitle: "First looks, priced honestly.",
  subtitleBn: "প্রথম দেখা, সৎ দামে।",
  startsAtMs: 1_000,
  endsAtMs: 5_000,
};
const noFlash = { active: false, endsAtMs: null };

describe("heroCampaignCopy (UX plan §2 campaign-aware hero)", () => {
  it("returns null on an ordinary day so the hero is untouched", () => {
    expect(heroCampaignCopy(off, noFlash, null, "en", tFor("en"))).toBeNull();
    expect(heroCampaignCopy({ ...eid, state: "ended" }, noFlash, null, "en", tFor("en"))).toBeNull();
  });

  it("live campaign: Bengali creative, countdown to close, CTA to /campaign", () => {
    const c = heroCampaignCopy({ ...eid, state: "live" }, noFlash, null, "bn", tFor("bn"));
    expect(c?.kind).toBe("campaign-live");
    expect(c?.title).toBe("ঈদ এডিট");
    expect(c?.subtitle).toBe("প্রথম দেখা, সৎ দামে।");
    expect(c?.href).toBe("/campaign");
    expect(c?.clock).toEqual({ kind: "down", atMs: 5_000 });
    expect(c?.eyebrow).toBe("এখন চলছে");
  });

  it("teaser: counts up to the opening and sells early access", () => {
    const c = heroCampaignCopy({ ...eid, state: "teaser", titleBn: "" }, noFlash, null, "bn", tFor("bn"));
    expect(c?.kind).toBe("campaign-teaser");
    expect(c?.title).toBe("Eid Edit"); // bn falls back to en when blank
    expect(c?.clock).toEqual({ kind: "up", atMs: 1_000 });
    expect(c?.ctaLabel).toBe("আগে জানুন");
  });

  it("flash drop without a campaign: percent in Bengali digits, CTA to /offers", () => {
    const c = heroCampaignCopy(off, { active: true, endsAtMs: 9_000 }, { title: "", discountPct: 20 }, "bn", tFor("bn"));
    expect(c?.kind).toBe("flash");
    expect(c?.title).toContain("২০%");
    expect(c?.subtitle).toContain("২০%");
    expect(c?.href).toBe("/offers");
    expect(c?.clock).toEqual({ kind: "down", atMs: 9_000 });
    const en = heroCampaignCopy(off, { active: true, endsAtMs: 9_000 }, { title: "Friday Flash", discountPct: 15 }, "en", tFor("en"));
    expect(en?.title).toBe("Friday Flash");
    expect(en?.subtitle).toContain("15%");
  });

  it("a live campaign outranks a running flash drop", () => {
    const c = heroCampaignCopy({ ...eid, state: "live" }, { active: true, endsAtMs: 9_000 }, { discountPct: 20 }, "en", tFor("en"));
    expect(c?.kind).toBe("campaign-live");
  });
});
