import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  totals: new Map<string, { earned: number; paid: number; lastPayoutAt: number | null }>(),
  pushed: [] as { shopIds: readonly string[]; title: string; body: string }[],
  accepted: 1,
}));

vi.mock("../shop-balances", () => ({ shopBalanceTotals: async () => state.totals }));
vi.mock("../../vendor-push", async () => {
  const real = await vi.importActual<typeof import("../../vendor-push")>("../../vendor-push");
  return {
    ...real,
    pushVendorShops: async (_db: unknown, shopIds: readonly string[], p: { title: string; body: string }) => {
      state.pushed.push({ shopIds, title: p.title, body: p.body });
      return state.accepted;
    },
  };
});

import { runShopOwesReminder, SHOP_OWES_MIN_PAISA } from "../shop-owes-reminder";

const db = {} as never;
// 12:00 Dhaka (06:00Z) on 2026-10-03.
const NOON = Date.parse("2026-10-03T06:00:00Z");

const claimer = () => {
  const seen = new Set<string>();
  return {
    keys: seen,
    claim: async (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
};

beforeEach(() => {
  state.totals = new Map();
  state.pushed = [];
  state.accepted = 1;
});

describe("shop owes reminder", () => {
  it("reminds only shops that owe at least ৳100, with the amount in the message", async () => {
    state.totals.set("owes", { earned: 0, paid: 25_050, lastPayoutAt: null }); // owes ৳250.50
    state.totals.set("small", { earned: 0, paid: SHOP_OWES_MIN_PAISA - 1, lastPayoutAt: null });
    state.totals.set("fine", { earned: 90_000, paid: 0, lastPayoutAt: null }); // PROSANTI owes THEM
    const c = claimer();
    const r = await runShopOwesReminder(db, NOON, c);
    expect(r.status).toBe("ran");
    expect(state.pushed).toHaveLength(1);
    expect(state.pushed[0].shopIds).toEqual(["owes"]);
    expect(state.pushed[0].body).toContain("250.5");
    expect([...c.keys]).toEqual(["shop-owes:owes:2026-10-03"]);
  });

  it("sends once per shop per Dhaka day", async () => {
    state.totals.set("owes", { earned: 0, paid: 50_000, lastPayoutAt: null });
    const c = claimer();
    await runShopOwesReminder(db, NOON, c);
    const again = await runShopOwesReminder(db, NOON + 15 * 60_000, c);
    expect(again.status).toBe("skipped");
    expect(state.pushed).toHaveLength(1);
    // Next day it reminds again.
    const next = await runShopOwesReminder(db, NOON + 24 * 3600_000, c);
    expect(next.status).toBe("ran");
    expect(state.pushed).toHaveLength(2);
  });

  it("stays quiet at night (before 10:00 / from 20:00 Dhaka)", async () => {
    state.totals.set("owes", { earned: 0, paid: 50_000, lastPayoutAt: null });
    for (const iso of ["2026-10-03T03:00:00Z" /* 09:00 */, "2026-10-03T14:00:00Z" /* 20:00 */]) {
      const r = await runShopOwesReminder(db, Date.parse(iso), claimer());
      expect(r.status).toBe("skipped");
    }
    expect(state.pushed).toHaveLength(0);
  });

  it("does nothing when nobody owes", async () => {
    state.totals.set("a", { earned: 10_000, paid: 0, lastPayoutAt: null });
    const r = await runShopOwesReminder(db, NOON, claimer());
    expect(r).toMatchObject({ status: "skipped", did: 0 });
  });

  it("propagates a missing marks table so the cron reports it instead of repeating", async () => {
    state.totals.set("owes", { earned: 0, paid: 50_000, lastPayoutAt: null });
    await expect(
      runShopOwesReminder(db, NOON, {
        claim: async () => {
          throw new Error("cron_marks table nai");
        },
      }),
    ).rejects.toThrow(/cron_marks/);
    expect(state.pushed).toHaveLength(0);
  });
});
