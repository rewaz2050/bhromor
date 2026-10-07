import { beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  activeAdminNavItem,
  adminTitleFor,
  pushRecentAdminNav,
  readCollapsedGroups,
  readRecentAdminNav,
  searchAdminNav,
  writeCollapsedGroups,
  __resetAdminNavCache,
} from "../admin-nav";

beforeEach(() => {
  window.localStorage.clear();
  __resetAdminNavCache();
});

describe("admin nav model", () => {
  it("keeps every admin route exactly once", () => {
    const hrefs = ADMIN_NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toHaveLength(new Set(hrefs).size);
    expect(hrefs.every((href) => href === "/admin" || href.startsWith("/admin/"))).toBe(true);
  });

  it("groups them so no group is a wall of its own", () => {
    expect(ADMIN_NAV_GROUPS.length).toBeGreaterThanOrEqual(5);
    for (const group of ADMIN_NAV_GROUPS) {
      expect(group.items.length).toBeLessThanOrEqual(5);
    }
    expect(ADMIN_NAV_GROUPS.reduce((n, g) => n + g.items.length, 0)).toBe(
      ADMIN_NAV_ITEMS.length,
    );
  });

  it("lights the parent item from a detail page underneath it", () => {
    expect(activeAdminNavItem("/admin/orders/4821")?.href).toBe("/admin/orders");
    expect(activeAdminNavItem("/admin/money/daily")?.href).toBe("/admin/money");
    expect(activeAdminNavItem("/admin/riders/scorecard")?.href).toBe("/admin/riders");
    // The dashboard owns /admin only — never every page below it.
    expect(activeAdminNavItem("/admin/orders")?.href).toBe("/admin/orders");
    expect(activeAdminNavItem("/admin")?.href).toBe("/admin");
  });

  it("titles the header from the route", () => {
    expect(adminTitleFor("/admin/orders/4821")).toBe("Order details");
    expect(adminTitleFor("/admin/live")).toBe("Live shopping");
    expect(adminTitleFor("/admin/somewhere-new")).toBe("Admin");
  });
});

describe("searchAdminNav", () => {
  it("finds by label prefix", () => {
    expect(searchAdminNav("payo")[0].item.href).toBe("/admin/payouts");
  });

  it("finds by the words staff actually type, not the label", () => {
    expect(searchAdminNav("bkash")[0].item.href).toBe("/admin/payments");
    expect(searchAdminNav("stock")[0].item.href).toBe("/admin/inventory");
    expect(searchAdminNav("coverage")[0].item.href).toBe("/admin/zones");
    expect(searchAdminNav("approve").map((h) => h.item.href)).toEqual(
      expect.arrayContaining(["/admin/shops", "/admin/riders"]),
    );
  });

  it("finds a word inside a two-word label", () => {
    expect(searchAdminNav("zone")[0].item.href).toBe("/admin/zones");
    expect(searchAdminNav("requests")[0].item.href).toBe("/admin/access");
  });

  it("ranks an exact label above a keyword-only hit", () => {
    const hits = searchAdminNav("money");
    expect(hits[0].item.href).toBe("/admin/money");
    expect(hits[0].score).toBeLessThanOrEqual(1);
  });

  it("returns nothing for gibberish and nothing for an empty query", () => {
    expect(searchAdminNav("zzzz")).toEqual([]);
    expect(searchAdminNav("   ")).toEqual([]);
  });
});

describe("remembered navigation state", () => {
  it("keeps recents newest-first and drops duplicates", () => {
    pushRecentAdminNav("/admin/orders");
    pushRecentAdminNav("/admin/payouts");
    pushRecentAdminNav("/admin/orders");
    expect(readRecentAdminNav()).toEqual(["/admin/orders", "/admin/payouts"]);
  });

  it("drops a route that no longer exists instead of offering a dead link", () => {
    window.localStorage.setItem(
      "admin.recent-nav.v1",
      JSON.stringify(["/admin/old-page", "/admin/orders"]),
    );
    expect(readRecentAdminNav()).toEqual(["/admin/orders"]);
  });

  it("remembers collapsed groups, and only real ones", () => {
    writeCollapsedGroups(["ops", "/not-a-group"]);
    expect(readCollapsedGroups()).toEqual(["ops"]);
  });
});
