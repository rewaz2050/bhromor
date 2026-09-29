/**
 * C3 (2026-09-29) — the rules that turn a shop's file into "what needs doing".
 *
 * A detail page listing numbers makes staff do the arithmetic at 11pm. These
 * tests pin the reading instead: a shop with a problem must not look like a
 * healthy shop with a long page, and a shop that is merely away for Eid must
 * not be flagged as broken.
 */
import { describe, expect, it } from "vitest";
import {
  BALANCE_DUE_AFTER_DAYS,
  attentionFlags,
  commissionActorLabel,
  commissionChangeLabel,
  commissionTrailSummary,
  pctLabel,
  dossierHeadline,
  shopAgeDays,
  type AttentionFlag,
} from "@/lib/shop-dossier";
import type { AdminShopDetail } from "@/lib/db/admin-shop";
import type { Shop } from "@/lib/catalog";

const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const DAY = 86_400_000;

const shop = (over: Partial<Shop> = {}): Shop => ({
  id: "shop-1",
  slug: "sitara",
  name: "সিতারা",
  phone: "01711111111",
  contactEmail: "owner@example.com",
  address: "Boropara",
  zoneIds: ["z1"],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: true,
  ratingAvg: 4.2,
  ratingCount: 12,
  // B5 — the papers are on file, so a healthy shop has nothing to report.
  verification: { nid: true, tradeLicence: true, verifiedAt: NOW - 200 * DAY },
  ...over,
});

const detail = (over: Partial<AdminShopDetail> = {}): AdminShopDetail => ({
  shop: shop(),
  staff: [{ userId: "u1", name: "Owner", login: "owner@example.com", role: "owner", addedAt: NOW - 30 * DAY }],
  catalog: { total: 10, published: 8, drafts: 2, hidden: 0, outOfStock: 1, sample: [], windowFull: false },
  orders: {
    recent: [],
    count: 40,
    delivered: 30,
    cancelled: 2,
    open: 3,
    revenue: 1_200_000,
    windowFull: false,
    window: 500,
  },
  ledger: {
    earned: 900_000,
    paid: 700_000,
    balance: 200_000,
    lastPayoutAt: NOW - 3 * DAY,
    lines: [],
    payouts: [],
  },
  reviews: { count: 12, average: 4.2, public: 11, pending: 0, recent: [] },
  // C4 — joined at 15% and never moved, so a healthy shop has nothing to say.
  commission: {
    current: 15,
    changes: 0,
    last: { id: "c1", shopId: "shop-1", fromPct: null, toPct: 15, at: NOW - 200 * DAY, actorId: null, actorEmail: null },
    lines: [{ id: "c1", shopId: "shop-1", fromPct: null, toPct: 15, at: NOW - 200 * DAY, actorId: null, actorEmail: null }],
    available: true,
  },
  ...over,
});

const ids = (flags: AttentionFlag[]): string[] => flags.map((f) => f.id);

describe("attentionFlags — a healthy shop", () => {
  it("says nothing when there is nothing to do", () => {
    expect(attentionFlags(detail(), NOW)).toEqual([]);
  });
});

describe("attentionFlags — the things that stop a shop trading", () => {
  it("leads with a pending application", () => {
    const flags = attentionFlags(
      detail({ shop: shop({ status: "pending" }) }),
      NOW,
    );
    expect(ids(flags)).toContain("pending-application");
    expect(flags[0].tone).toBe("stop");
  });

  it("names why a suspended shop is stopped", () => {
    const flags = attentionFlags(
      detail({
        shop: shop({ status: "suspended", review: { note: "fake NID", at: NOW, by: "staff@example.com" } }),
      }),
      NOW,
    );
    const flag = flags.find((f) => f.id === "suspended");
    expect(flag?.text).toMatch(/suspended/);
    expect(flag?.text).toMatch(/fake NID/);
  });

  it("will not let an active shop trade with no delivery zone", () => {
    const flags = attentionFlags(detail({ shop: shop({ zoneIds: [] }) }), NOW);
    const flag = flags.find((f) => f.id === "no-zone");
    expect(flag?.tone).toBe("stop");
  });

  it("says when the shop is invisible because nothing is published", () => {
    const empty = attentionFlags(
      detail({ catalog: { total: 0, published: 0, drafts: 0, hidden: 0, outOfStock: 0, sample: [], windowFull: false } }),
      NOW,
    );
    expect(empty.find((f) => f.id === "nothing-published")?.text).toMatch(/invisible/);
    const saved = attentionFlags(
      detail({ catalog: { total: 6, published: 0, drafts: 6, hidden: 0, outOfStock: 0, sample: [], windowFull: false } }),
      NOW,
    );
    expect(saved.find((f) => f.id === "nothing-published")?.text).toMatch(/6 products saved/);
  });
});

describe("attentionFlags — a holiday is a date, not a fault", () => {
  it("reports the day the shop is back instead of calling it closed", () => {
    const flags = attentionFlags(
      detail({ shop: shop({ vacation: { start: "2026-09-28", end: "2026-09-30" } }) }),
      NOW,
    );
    const holiday = flags.find((f) => f.id === "on-holiday");
    expect(holiday?.tone).toBe("note");
    expect(holiday?.text).toMatch(/1 Oct/); // the day after the window ends
    // A shop away on holiday is NOT also reported as merely closed.
    expect(ids(flags)).not.toContain("closed-now");
  });

  it("says a BOOKED holiday is coming, so a closed shop is never a surprise", () => {
    const flags = attentionFlags(
      detail({ shop: shop({ vacation: { start: "2026-10-10", end: "2026-10-12" } }) }),
      NOW,
    );
    const holiday = flags.find((f) => f.id === "on-holiday");
    expect(holiday?.text).toMatch(/10–12 Oct/);
    expect(holiday?.text).toMatch(/reopens on its own/);
  });

  it("calls a shop that simply closed its sign 'closed'", () => {
    const flags = attentionFlags(detail({ shop: shop({ isOpen: false }) }), NOW);
    expect(ids(flags)).toContain("closed-now");
  });

  it("says nothing about a holiday that has already passed", () => {
    const flags = attentionFlags(
      detail({ shop: shop({ vacation: { start: "2026-01-01", end: "2026-01-03" } }) }),
      NOW,
    );
    expect(ids(flags)).not.toContain("on-holiday");
  });
});

describe("attentionFlags — the quiet problems", () => {
  it("notices a shop with no owner login (C1)", () => {
    const flags = attentionFlags(detail({ staff: [] }), NOW);
    expect(flags.find((f) => f.id === "no-owner-login")?.tone).toBe("warn");
    const staffOnly = attentionFlags(
      detail({
        staff: [{ userId: "u2", name: "Assistant", login: "a@example.com", role: "staff", addedAt: NOW }],
      }),
      NOW,
    );
    expect(ids(staffOnly)).toContain("no-owner-login");
  });

  it("does not shout about money that was paid out this week", () => {
    const flags = attentionFlags(detail(), NOW); // last payout 3 days ago
    expect(ids(flags)).not.toContain("balance-due");
  });

  it("does shout once the money has been sitting for a fortnight", () => {
    const stale = attentionFlags(
      detail({ ledger: { earned: 900_000, paid: 700_000, balance: 200_000, lastPayoutAt: NOW - (BALANCE_DUE_AFTER_DAYS + 1) * DAY, lines: [], payouts: [] } }),
      NOW,
    );
    const flag = stale.find((f) => f.id === "balance-due");
    expect(flag?.text).toMatch(/15 days ago/);
  });

  it("says so plainly when the shop has never been paid", () => {
    const never = attentionFlags(
      detail({ ledger: { earned: 500_000, paid: 0, balance: 500_000, lastPayoutAt: null, lines: [], payouts: [] } }),
      NOW,
    );
    expect(never.find((f) => f.id === "balance-due")?.text).toMatch(/nothing has ever/);
  });

  it("counts reviews waiting on moderation", () => {
    const flags = attentionFlags(detail({ reviews: { count: 5, average: 4, public: 2, pending: 3, recent: [] } }), NOW);
    expect(flags.find((f) => f.id === "reviews-waiting")?.text).toMatch(/3 reviews waiting/);
  });

  it("notes an unverified shop without calling it broken (B5)", () => {
    const flags = attentionFlags(detail({ shop: shop({ verification: { nid: false, tradeLicence: false } }) }), NOW);
    expect(flags.find((f) => f.id === "not-verified")?.tone).toBe("note");
    const verified = attentionFlags(detail({ shop: shop({ verification: { nid: true, tradeLicence: true, verifiedAt: NOW } }) }), NOW);
    expect(ids(verified)).not.toContain("not-verified");
  });

  it("puts the worst thing first", () => {
    const flags = attentionFlags(
      detail({
        shop: shop({ zoneIds: [] }),
        staff: [],
        reviews: { count: 1, average: 5, public: 0, pending: 1, recent: [] },
      }),
      NOW,
    );
    expect(flags[0].tone).toBe("stop");
    expect(flags.at(-1)?.tone).toBe("note");
  });
});

describe("attentionFlags — the commission trail (C4)", () => {
  const line = (from: number | null, to: number, daysAgo: number, email: string | null = "nazmul@prosanti.example") => ({
    id: `c-${from}-${to}`,
    shopId: "shop-1",
    fromPct: from,
    toPct: to,
    at: NOW - daysAgo * DAY,
    actorId: "staff-1",
    actorEmail: email,
  });

  it("says the rate went up while it is still recent enough to explain a call", () => {
    const flags = attentionFlags(
      detail({
        shop: shop({ commissionPct: 18 }),
        commission: {
          current: 18,
          changes: 1,
          last: line(15, 18, 4),
          lines: [line(null, 15, 200), line(15, 18, 4)],
          available: true,
        },
      }),
      NOW,
    );
    const flag = flags.find((f) => f.id === "commission-raised");
    expect(flag?.text).toMatch(/raised to 18% 4 days ago/);
  });

  it("says nothing when the rate came DOWN — that is not a complaint", () => {
    const flags = attentionFlags(
      detail({
        shop: shop({ commissionPct: 12 }),
        commission: {
          current: 12,
          changes: 1,
          last: line(15, 12, 2),
          lines: [line(null, 15, 200), line(15, 12, 2)],
          available: true,
        },
      }),
      NOW,
    );
    expect(ids(flags)).not.toContain("commission-raised");
  });

  it("stops mentioning a rise once the shop has lived with it a while", () => {
    const flags = attentionFlags(
      detail({
        shop: shop({ commissionPct: 18 }),
        commission: {
          current: 18,
          changes: 1,
          last: line(15, 18, 60),
          lines: [line(null, 15, 200), line(15, 18, 60)],
          available: true,
        },
      }),
      NOW,
    );
    expect(ids(flags)).not.toContain("commission-raised");
  });

  it("says so when the database is not recording commission changes yet", () => {
    const flags = attentionFlags(
      detail({ commission: { current: 15, changes: 0, last: null, lines: [], available: false } }),
      NOW,
    );
    const flag = flags.find((f) => f.id === "commission-trail-missing");
    expect(flag?.text).toMatch(/not being recorded/i);
  });
});

describe("the commission trail, read (C4)", () => {
  const change = (over: Record<string, unknown> = {}) =>
    ({
      id: "c1",
      shopId: "shop-1",
      fromPct: 15,
      toPct: 12.5,
      at: NOW,
      actorId: "staff-1",
      actorEmail: "nazmul@prosanti.example",
      ...over,
    }) as never;

  it("writes the move as an arrow, not as two numbers", () => {
    expect(commissionChangeLabel(change())).toBe("15% → 12.5%");
  });

  it("reads the first line as the rate the shop joined with", () => {
    expect(commissionChangeLabel(change({ fromPct: null, toPct: 15 }))).toBe("Started at 15%");
  });

  it("names the officer, and admits it when there was none", () => {
    expect(commissionActorLabel(change())).toBe("by nazmul@prosanti.example");
    expect(commissionActorLabel(change({ actorEmail: null, actorId: "staff-1" }))).toMatch(
      /no e-mail on file/,
    );
    expect(commissionActorLabel(change({ actorEmail: null, actorId: null }))).toMatch(
      /nobody was signed in/,
    );
  });

  it("summarises an untouched rate without pretending there was a change", () => {
    const summary = commissionTrailSummary({
      current: 15,
      changes: 0,
      last: change({ fromPct: null, toPct: 15 }) as never,
      lines: [change({ fromPct: null, toPct: 15 }) as never],
      available: true,
    });
    expect(summary).toMatch(/unchanged since the shop joined at 15%/i);
  });

  it("counts the moves and names the last officer", () => {
    const summary = commissionTrailSummary({
      current: 12.5,
      changes: 2,
      last: change() as never,
      lines: [change({ fromPct: null, toPct: 15 }) as never, change() as never],
      available: true,
    });
    expect(summary).toMatch(/2 changes/);
    expect(summary).toMatch(/nazmul@prosanti.example/);
  });

  it("never quotes a rate with a tail of zeroes", () => {
    expect(pctLabel(15)).toBe("15%");
    expect(pctLabel(12.5)).toBe("12.5%");
    expect(pctLabel(12.5001)).toBe("12.5%");
  });
});

describe("dossierHeadline", () => {
  it("reports what shoppers paid, not what the shop earned", () => {
    const head = dossierHeadline(detail());
    expect(head.revenue).toBe(1_200_000);
    expect(head.earned).toBe(900_000);
    expect(head.balance).toBe(200_000);
    expect(head.openOrders).toBe(3);
  });

  it("has no rating to show before the first review", () => {
    const head = dossierHeadline(detail({ reviews: { count: 0, average: 0, public: 0, pending: 0, recent: [] } }));
    expect(head.rating).toBeNull();
    expect(head.reviewCount).toBe(0);
  });
});

describe("shopAgeDays", () => {
  it("counts whole days and gives up on a missing date", () => {
    expect(shopAgeDays(NOW - 10 * DAY, NOW)).toBe(10);
    expect(shopAgeDays(NOW - 5 * DAY - 3_600_000, NOW)).toBe(5);
    expect(shopAgeDays(null, NOW)).toBeNull();
    expect(shopAgeDays(Number.NaN, NOW)).toBeNull();
  });
});
