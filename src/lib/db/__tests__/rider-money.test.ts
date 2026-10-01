/**
 * Rider money Phase 2 (202609300002) — the TS half of the wallet:
 *   • pay-rate settings live in `site_settings` as flat paisa keys, readable
 *     by SQL through ps_setting_int;
 *   • reads normalise jsonb numbers and degrade to empty/null on a database
 *     where the migration has not run (never a crash);
 *   • refusals from the payout RPC become honest, rider-readable sentences.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decideRiderPayout,
  getAdminMoneySummary,
  getRiderMoneySummary,
  listRiderMoneyEntries,
  listRiderPayoutQueue,
  parseRiderPaySettings,
  readRiderPaySettings,
  requestRiderPayout,
  sanitizeRiderPaySettings,
  writeRiderPaySettings,
} from "../rider-money";
import { AdminInputError } from "../admin";
import { RiderInputError } from "../riders";

const MISSING = {
  code: "PGRST202",
  message: "Could not find the function public.ps_rider_money_summary in the schema cache",
};

/** Chainable Supabase stub: awaits resolve to the configured result. */
const client = (opts: {
  rpc?: (fn: string, params?: unknown) => { data?: unknown; error?: unknown };
  tables?: Record<string, unknown> | ((table: string) => unknown);
  onUpdate?: (table: string, payload: unknown) => void;
  onUpsert?: (table: string, rows: unknown) => void;
}) => {
  const value = (table: string) =>
    typeof opts.tables === "function" ? opts.tables(table) : (opts.tables?.[table] ?? { data: [], error: null });
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "in", "order", "limit"]) {
        chain[method] = () => chain;
      }
      chain.upsert = async (rows: unknown) => {
        opts.onUpsert?.(table, rows);
        return value(table);
      };
      chain.update = (payload: unknown) => {
        opts.onUpdate?.(table, payload);
        return chain;
      };
      chain.then = (ok: unknown, bad: unknown) =>
        Promise.resolve(value(table)).then(ok as never, bad as never);
      chain.catch = (bad: unknown) => Promise.resolve(value(table)).catch(bad as never);
      return chain;
    },
    rpc: async (fn: string, params?: unknown) => opts.rpc?.(fn, params) ?? { data: null, error: MISSING },
  };
};

describe("rider pay settings", () => {
  it("parses taka-typed numbers, clamps negatives and caps", () => {
    expect(parseRiderPaySettings({ baseFee: 4000, codHandlingFee: "1000", minPayout: 50000 })).toEqual({
      settings: { baseFee: 4000, codHandlingFee: 1000, minPayout: 50000 },
    });
    const capped = parseRiderPaySettings({ baseFee: 999_999, codHandlingFee: 0, minPayout: 0 });
    expect(capped.settings.baseFee).toBe(100_000);
    const negative = parseRiderPaySettings({ baseFee: -5, codHandlingFee: 0, minPayout: 0 });
    expect(negative.error).toMatch(/not a valid amount/);
  });

  it("refuses a save with a field-naming message instead of silently zeroing", () => {
    const { settings, error } = parseRiderPaySettings({ baseFee: "abc", codHandlingFee: 1, minPayout: 1 });
    expect(error).toMatch(/Per-delivery fee/);
    expect(settings).toEqual({ baseFee: 0, codHandlingFee: 0, minPayout: 0 });
  });

  it("reads the three keys out of site_settings", async () => {
    const db = client({
      tables: {
        site_settings: {
          data: [
            { key: "rider_base_fee_paisa", value: 4000 },
            { key: "rider_cod_handling_fee_paisa", value: "1000" },
            { key: "rider_min_payout_paisa", value: 25000 },
          ],
          error: null,
        },
      },
    });
    expect(await readRiderPaySettings(db as never)).toEqual({
      baseFee: 4000,
      codHandlingFee: 1000,
      minPayout: 25000,
    });
  });

  it("falls back to the zeros default when the read fails", async () => {
    const db = client({ tables: { site_settings: { data: null, error: { code: "42P01" } } } });
    expect(await readRiderPaySettings(db as never)).toEqual(sanitizeRiderPaySettings({}));
  });

  it("writes the three rows and refuses nonsense", async () => {
    let written: unknown = null;
    const db = client({
      tables: { site_settings: { error: null } },
      onUpsert: (_table, rows) => {
        written = rows;
      },
    });
    await expect(
      writeRiderPaySettings(db as never, { baseFee: 4000, codHandlingFee: 1000, minPayout: 50000 }),
    ).resolves.toEqual({ baseFee: 4000, codHandlingFee: 1000, minPayout: 50000 });
    expect(written).toEqual([
      { key: "rider_base_fee_paisa", value: 4000 },
      { key: "rider_cod_handling_fee_paisa", value: 1000 },
      { key: "rider_min_payout_paisa", value: 50000 },
    ]);
    await expect(writeRiderPaySettings(client({}) as never, { baseFee: "x" })).rejects.toBeInstanceOf(
      AdminInputError,
    );
  });
});

describe("rider statement", () => {
  it("normalises the jsonb summary (paisa strings → numbers)", async () => {
    const svc = client({
      rpc: (fn) => {
        expect(fn).toBe("ps_rider_money_summary");
        return {
          data: {
            balance: "14000",
            cashInHand: 220000,
            today: 19000,
            week: "19000",
            lifetime: 19000,
            tips: 5000,
            deliveryFees: 12000,
            codHandling: 2000,
            incentives: null,
            paidOut: 5000,
            pendingPayout: 0,
            deliveriesToday: 3,
            baseFee: 4000,
            codHandlingFee: 1000,
            minPayout: 1000,
          },
          error: null,
        };
      },
    });
    const summary = await getRiderMoneySummary(svc as never);
    expect(summary).toMatchObject({
      balance: 14000,
      cashInHand: 220000,
      today: 19000,
      incentives: 0,
      deliveriesToday: 3,
      minPayout: 1000,
    });
  });

  it("answers null (not a crash) before the migration runs", async () => {
    const svc = client({ rpc: () => ({ data: null, error: MISSING }) });
    expect(await getRiderMoneySummary(svc as never)).toBeNull();
  });

  it("joins the journal rows to public order numbers and hides the uuid", async () => {
    const svc = client({
      tables: (table) =>
        table === "rider_earnings"
          ? {
              data: [
                {
                  id: "e1",
                  rider_id: "r1",
                  order_id: "11111111-1111-1111-1111-111111111111",
                  kind: "tip",
                  amount: 5000,
                  payout_id: null,
                  note: "",
                  created_at: "2026-09-30T10:00:00.000Z",
                },
                {
                  id: "e2",
                  rider_id: "r1",
                  order_id: null,
                  kind: "payout",
                  amount: -5000,
                  payout_id: "p1",
                  note: "payout request",
                  created_at: "2026-09-30T11:00:00.000Z",
                },
              ],
              error: null,
            }
          : {
              data: [
                { id: "11111111-1111-1111-1111-111111111111", order_no: "PS-20260930-0001" },
              ],
              error: null,
            },
    });
    const entries = await listRiderMoneyEntries(svc as never, "r1");
    expect(entries[0]).toMatchObject({ kind: "tip", amount: 5000, orderId: "PS-20260930-0001" });
    expect(entries[1]).toMatchObject({ kind: "payout", amount: -5000, payoutId: "p1" });
    expect(JSON.stringify(entries)).not.toContain("11111111-1111-1111-1111-111111111111");
  });

  it("returns an empty feed before the migration runs", async () => {
    const svc = client({ tables: { rider_earnings: { data: null, error: { code: "PGRST205" } } } });
    expect(await listRiderMoneyEntries(svc as never, "r1")).toEqual([]);
  });
});

describe("payout requests", () => {
  it("maps the RPC row into the rider-facing shape", async () => {
    const db = client({
      rpc: (fn, params) => {
        expect(fn).toBe("ps_rider_request_payout");
        expect(params).toEqual({ p_amount: 5000, p_method: "bkash", p_account: "01700000000" });
        return {
          data: {
            id: "p1",
            rider_id: "r1",
            amount: 5000,
            method: "bkash",
            account: "01700000000",
            status: "pending",
            requested_at: "2026-09-30T11:00:00.000Z",
            decided_at: null,
            decided_by: null,
            decided_by_email: null,
            note: null,
            reference: "",
          },
          error: null,
        };
      },
    });
    await expect(
      requestRiderPayout(db as never, { amount: 5000, method: "bkash", account: "01700000000" }),
    ).resolves.toMatchObject({ id: "p1", amount: 5000, status: "pending", reference: "" });
  });

  it.each([
    ["payout already pending", 409],
    ["insufficient earnings balance", 422],
    ["below minimum payout", 422],
    ["account number required", 422],
    ["rider not active", 403],
  ])("turns '%s' into a rider-readable refusal (%i)", async (message, status) => {
    const db = client({ rpc: () => ({ data: null, error: { message } }) });
    const failure = await requestRiderPayout(db as never, {
      amount: 100,
      method: "bkash",
      account: "01700000000",
    }).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(RiderInputError);
    expect((failure as RiderInputError).status).toBe(status);
  });

  it("says the backend update is missing instead of leaking SQL", async () => {
    const db = client({ rpc: () => ({ data: null, error: MISSING }) });
    const failure = await requestRiderPayout(db as never, {
      amount: 100,
      method: "cash",
      account: "",
    }).catch((err: unknown) => err);
    expect((failure as RiderInputError).status).toBe(503);
    expect((failure as RiderInputError).message).toContain("202609300002");
  });
});

describe("admin money", () => {
  it("normalises every summary key", async () => {
    const svc = client({
      rpc: (fn) => {
        expect(fn).toBe("ps_admin_money_summary");
        return { data: { commissionIncome: "10000", riderPayable: 14000, codCustody: null }, error: null };
      },
    });
    const summary = await getAdminMoneySummary(svc as never);
    expect(summary?.commissionIncome).toBe(10000);
    expect(summary?.riderPayable).toBe(14000);
    expect(summary?.codCustody).toBe(0);
    expect(summary?.deliveryIncome).toBe(0);
  });

  it("returns null before the migration runs", async () => {
    expect(await getAdminMoneySummary(client({ rpc: () => ({ data: null, error: MISSING }) }) as never)).toBeNull();
  });

  it("builds the queue with the rider's live wallet and cash", async () => {
    const svc = client({
      tables: (table) =>
        table === "rider_payout_requests"
          ? {
              data: [
                {
                  id: "p1",
                  rider_id: "r1",
                  amount: 5000,
                  method: "bkash",
                  account: "01700000000",
                  status: "pending",
                  requested_at: "2026-09-30T11:00:00.000Z",
                  decided_at: null,
                  decided_by: null,
                  decided_by_email: null,
                  note: null,
                  reference: "",
                },
              ],
              error: null,
            }
          : {
              data: [
                {
                  id: "r1",
                  name: "Karim",
                  phone: "01700000000",
                  earnings_balance: "14000",
                  cash_in_hand: 220000,
                },
              ],
              error: null,
            },
    });
    const queue = await listRiderPayoutQueue(svc as never);
    expect(queue?.pending).toHaveLength(1);
    expect(queue?.pending[0]).toMatchObject({
      riderName: "Karim",
      earningsBalance: 14000,
      cashInHand: 220000,
    });
  });

  it("records the staff decision, including who signed it off", async () => {
    let updated: unknown = null;
    const svc = client({
      rpc: (fn, params) => {
        expect(fn).toBe("ps_admin_decide_rider_payout");
        expect(params).toMatchObject({ p_decision: "paid", p_reference: "TRX1" });
        return {
          data: {
            id: "p1",
            rider_id: "r1",
            amount: 5000,
            method: "bkash",
            account: "01700000000",
            status: "paid",
            requested_at: "2026-09-30T11:00:00.000Z",
            decided_at: "2026-09-30T12:00:00.000Z",
            decided_by: "staff-1",
            decided_by_email: null,
            note: null,
            reference: "TRX1",
          },
          error: null,
        };
      },
      onUpdate: (_table, payload) => {
        updated = payload;
      },
    });
    const payout = await decideRiderPayout(
      svc as never,
      svc as never,
      { id: "staff-1", email: "owner@prosanti.test" },
      { payoutId: "p1", decision: "paid", reference: "TRX1" },
    );
    expect(payout).toMatchObject({ status: "paid", reference: "TRX1" });
    expect(updated).toEqual({ decided_by_email: "owner@prosanti.test" });
  });

  it("refuses a second decision with a 409", async () => {
    const svc = client({
      rpc: () => ({ data: null, error: { message: "payout already paid" } }),
    });
    await expect(
      decideRiderPayout(svc as never, svc as never, { id: "staff-1" }, { payoutId: "p1", decision: "paid" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
