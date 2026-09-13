import { describe, expect, it, beforeEach } from "vitest";
import { PRODUCTS } from "../catalog";
import { bdt } from "../format";
import {
  PRICE_SNAPSHOT_KEY,
  __resetPriceWatch,
  dropFor,
  dropLabel,
  dropsFor,
  forgetPrice,
  getPriceSnapshots,
  recordPrice,
  sanitizeSnapshots,
  togglePriceAlert,
  getAlerts,
  validateWatch,
  watchNotice,
} from "../price-drop";

const AT = Date.UTC(2026, 8, 13, 6, 0, 0);
const DAY = 86_400_000;
const gamcha = PRODUCTS.find((p) => p.subCategory === "Gamcha")!;

beforeEach(() => {
  window.localStorage.clear();
  __resetPriceWatch();
});

describe("Price memory", () => {
  it("remembers what a product cost when it was saved", () => {
    recordPrice(gamcha.id, gamcha.price, AT);
    expect(getPriceSnapshots()[gamcha.id]).toEqual({ price: gamcha.price, at: AT });
    expect(window.localStorage.getItem(PRICE_SNAPSHOT_KEY)).toContain(String(gamcha.price));
  });

  it("tracks the price the shopper last saw — up as well as down", () => {
    recordPrice(gamcha.id, gamcha.price, AT);
    recordPrice(gamcha.id, gamcha.price + bdt(50), AT + DAY);
    expect(getPriceSnapshots()[gamcha.id].price).toBe(gamcha.price + bdt(50));
    // A number back at what they last saw is not a drop…
    expect(
      dropFor({ ...gamcha, price: gamcha.price + bdt(50) }, getPriceSnapshots(), AT + 2 * DAY),
    ).toBeNull();
    // …and going under it is exactly what we announce.
    expect(
      dropFor({ ...gamcha, price: gamcha.price }, getPriceSnapshots(), AT + 2 * DAY)!.down,
    ).toBe(bdt(50));
  });

  it("forgets on request", () => {
    recordPrice(gamcha.id, gamcha.price, AT);
    forgetPrice(gamcha.id);
    expect(getPriceSnapshots()[gamcha.id]).toBeUndefined();
  });

  it("drops malformed stored rows", () => {
    expect(
      sanitizeSnapshots({
        p7: { price: 35000, at: AT },
        broken: { price: "nope", at: AT },
        ancient: { price: 100 },
        [`${"x".repeat(70)}`]: { price: 100, at: AT },
      }),
    ).toEqual({ p7: { price: 35000, at: AT } });
    expect(sanitizeSnapshots(null)).toEqual({});
    expect(sanitizeSnapshots([])).toEqual({});
  });
});

describe("Drop detection", () => {
  it("reports a real drop and only a real drop", () => {
    recordPrice(gamcha.id, bdt(400), AT);
    const cheaper = { ...gamcha, price: bdt(350) };
    const drop = dropFor(cheaper, getPriceSnapshots(), AT + 2 * DAY)!;
    expect(drop).toMatchObject({ down: bdt(50), pct: 13, days: 2, sinceLabel: "2 days ago" });
    expect(dropLabel(drop)).toBe("৳50 less than the last price you saw");
    // Same price, or a price rise: nothing to announce.
    expect(dropFor({ ...gamcha, price: bdt(400) }, { [gamcha.id]: { price: bdt(400), at: AT } })).toBeNull();
    expect(dropFor({ ...gamcha, price: bdt(450) }, { [gamcha.id]: { price: bdt(400), at: AT } })).toBeNull();
  });

  it("says today for a same-day move", () => {
    expect(
      dropLabel(
        dropFor({ ...gamcha, price: bdt(100) }, { [gamcha.id]: { price: bdt(200), at: AT } }, AT + 1000)!,
      ),
    ).toBe("৳100 less than the last price you saw");
    expect(
      dropFor({ ...gamcha, price: bdt(100) }, { [gamcha.id]: { price: bdt(200), at: AT } }, AT + 1000)!.sinceLabel,
    ).toBe("today");
  });

  it("scans a whole list at once", () => {
    const other = PRODUCTS[0];
    const snapshots = sanitizeSnapshots({
      [gamcha.id]: { price: gamcha.price + bdt(100), at: AT },
      [other.id]: { price: other.price - bdt(200), at: AT },
    });
    const drops = dropsFor(PRODUCTS, snapshots, AT + DAY);
    expect([...drops.keys()]).toEqual([gamcha.id]);
    expect(drops.get(gamcha.id)!.down).toBe(bdt(100));
  });

  it("is quiet with no memory at all", () => {
    expect(dropsFor(PRODUCTS, {}, AT).size).toBe(0);
  });
});

describe("Alerts list", () => {
  it("toggles per product and survives a re-read", () => {
    expect(togglePriceAlert(gamcha.id)).toBe(true);
    expect(getAlerts()).toEqual([gamcha.id]);
    expect(togglePriceAlert(gamcha.id)).toBe(false);
    expect(getAlerts()).toEqual([]);
    expect(togglePriceAlert("p3")).toBe(true);
    expect(togglePriceAlert("p3")).toBe(false);
  });
});

describe("Watch intake", () => {
  it("needs a product and a reachable number", () => {
    const out = validateWatch({ productId: gamcha.id, phone: "01712345678" });
    expect(out.ok).toBe(true);
    expect(out.value).toEqual({ productId: gamcha.id, phone: "01712345678" });
    const bad = validateWatch({ productId: "", phone: "123" });
    expect(bad.ok).toBe(false);
    expect(Object.keys(bad.errors).sort()).toEqual(["phone", "productId"]);
  });

  it("normalizes a +880 number and clamps a silly target", () => {
    expect(validateWatch({ productId: "p7", phone: "+880 17-1234 5678" }).value.phone).toBe("01712345678");
    expect(validateWatch({ productId: "p7", phone: "01712345678", targetPaisa: 5 }).ok).toBe(false);
    expect(
      validateWatch({ productId: "p7", phone: "01712345678", targetPaisa: bdt(300) }).value.targetPaisa,
    ).toBe(bdt(300));
  });

  it("counts the queue for the staff bell", () => {
    expect(watchNotice("Gamcha Riverside Set", 3, bdt(400), bdt(350))).toContain("3 shoppers want");
    expect(watchNotice("Gamcha Riverside Set", 1, bdt(400), bdt(350))).toContain("1 shopper wants");
  });
});
