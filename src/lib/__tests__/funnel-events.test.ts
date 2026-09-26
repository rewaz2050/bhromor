/**
 * First-party funnel wire model (UX plan §0).
 *
 * The sink accepts only what the report can use: whitelisted event names,
 * short strings, a sane session id, ≤ 25 events per batch. And the report
 * parser must never throw on whatever the RPC (or an old one) returns.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_FUNNEL,
  FUNNEL_EVENT_NAMES,
  MAX_BATCH_EVENTS,
  funnelRates,
  parseFunnelReport,
  sanitizeWireBatch,
  sanitizeWireEvent,
} from "@/lib/funnel-events";

describe("sanitizeWireEvent", () => {
  it("keeps only known names and trims every field", () => {
    expect(sanitizeWireEvent({ t: "hack" })).toBeNull();
    expect(sanitizeWireEvent("page_view")).toBeNull();
    expect(sanitizeWireEvent(null)).toBeNull();
    const ev = sanitizeWireEvent({
      t: "add_to_cart",
      p: "/product/x?utm=1#top",
      pid: " prod-1 ",
      shop: "shop-1",
      src: "card",
      v: 189000.4,
      lang: "bn",
      meta: { q: "x".repeat(300), n: 2, ok: true, bad: { nested: 1 }, e: 1, f: 2, g: 3 },
    });
    expect(ev).toEqual({
      t: "add_to_cart",
      p: "/product/x",
      pid: "prod-1",
      shop: "shop-1",
      src: "card",
      v: 189000,
      lang: "bn",
      meta: { q: "x".repeat(200), n: 2, ok: true, e: 1, f: 2 },
    });
  });

  it("drops paths that are not paths, negative or NaN numbers, unknown langs", () => {
    const ev = sanitizeWireEvent({ t: "search", p: "https://evil.example/x", v: -4, lang: "fr" });
    expect(ev).toEqual({ t: "search" });
    expect(sanitizeWireEvent({ t: "scroll_depth", v: Number.NaN })).toEqual({ t: "scroll_depth" });
  });

  it("knows the nine funnel events", () => {
    expect(FUNNEL_EVENT_NAMES).toEqual([
      "page_view",
      "view_item_list",
      "select_item",
      "view_item",
      "add_to_cart",
      "begin_checkout",
      "purchase",
      "search",
      "scroll_depth",
    ]);
  });
});

describe("sanitizeWireBatch", () => {
  it("requires a sane session id and at least one usable event", () => {
    expect(sanitizeWireBatch({ sid: "short", events: [{ t: "page_view" }] })).toBeNull();
    expect(sanitizeWireBatch({ sid: "ABCDEF0123456789", events: [] })).toBeNull();
    expect(sanitizeWireBatch({ sid: "abcdef0123456789", events: [{ t: "nope" }] })).toBeNull();
    expect(sanitizeWireBatch({ sid: "ABCDEF0123456789", events: [{ t: "page_view", p: "/" }] })).toEqual({
      sid: "abcdef0123456789",
      events: [{ t: "page_view", p: "/" }],
    });
  });

  it("caps a batch at MAX_BATCH_EVENTS", () => {
    const events = Array.from({ length: 40 }, () => ({ t: "page_view", p: "/" }));
    const batch = sanitizeWireBatch({ sid: "abcdef0123456789", events });
    expect(batch?.events).toHaveLength(MAX_BATCH_EVENTS);
    expect(MAX_BATCH_EVENTS).toBe(25);
  });
});

describe("parseFunnelReport + funnelRates", () => {
  it("turns the RPC blob into rates without throwing on gaps", () => {
    const r = parseFunnelReport(
      {
        sessions: 200,
        page_views: 640,
        bounced_sessions: 80,
        pdp_sessions: 100,
        atc_sessions: 25,
        checkout_sessions: 10,
        purchase_sessions: 6,
        orders: 7,
        aov: 145000,
        customers: 7,
        repeat_customers: 2,
        atc_by_source: [{ source: "card", count: 15 }, { source: "pdp", count: 10 }],
        top_searches: [
          { query: "saree", count: 9, max_results: 12 },
          { query: "iphone", count: 4, max_results: 0 },
        ],
        home_sessions: 120,
        home_scroll: [
          { depth: 25, sessions: 90 },
          { depth: 100, sessions: 12 },
        ],
      },
      7,
    );
    expect(r.bounceRate).toBeCloseTo(0.4);
    expect(r.pagesPerSession).toBeCloseTo(3.2);
    expect(r.repeatRate).toBeCloseTo(2 / 7);
    expect(r.topSearches[1]).toEqual({ query: "iphone", count: 4, zeroResults: true });
    expect(r.homeScroll[0].share).toBeCloseTo(0.75);
    const rates = funnelRates(r);
    expect(rates.pdpToAtc).toBeCloseTo(0.25);
    expect(rates.atcToCheckout).toBeCloseTo(0.4);
    expect(rates.checkoutToOrder).toBeCloseTo(0.7);
    expect(rates.sessionToOrder).toBeCloseTo(0.035);
  });

  it("is all zeros for garbage — and rates never divide by zero", () => {
    expect(parseFunnelReport(null, 28)).toEqual({ ...EMPTY_FUNNEL, days: 28 });
    expect(parseFunnelReport("nope", 7)).toEqual(EMPTY_FUNNEL);
    expect(funnelRates(EMPTY_FUNNEL)).toEqual({
      pdpToAtc: 0,
      atcToCheckout: 0,
      checkoutToOrder: 0,
      sessionToOrder: 0,
    });
  });
});
