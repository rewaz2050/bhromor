import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildMoneyExport } from "../money-export";
import { parseExportRange, EXPORT_ROW_CAP } from "../../money-export";

const range = (() => {
  const r = parseExportRange("2026-09-01", "2026-09-30");
  if (!r.ok) throw new Error("range");
  return r.range;
})();

interface Call { table: string; filters: string[]; from?: number }

/** A fake service: ledger rows are generated per page; lookup tables return fixed rows. */
const fakeService = (opts: { total: number; ledgerError?: { code?: string; message?: string } }) => {
  const calls: Call[] = [];
  const service = {
    from: (table: string) => {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order"]) chain[m] = () => chain;
      for (const m of ["gte", "lt", "in"]) chain[m] = (col: string, v: unknown) => { call.filters.push(`${m}:${col}:${String(v)}`); return chain; };
      chain.range = (a: number, b: number) => {
        call.from = a;
        if (opts.ledgerError) return Promise.resolve({ data: null, error: opts.ledgerError });
        const rows = [];
        for (let i = a; i <= b && i < opts.total; i++) rows.push({ id: `e${i}`, rider_id: "r1", order_id: null, kind: "tip", amount: 100, note: "", created_at: "2026-09-10T00:00:00Z" });
        return Promise.resolve({ data: rows, error: null });
      };
      chain.then = (ok: (v: unknown) => unknown) => {
        const data = table === "riders" ? [{ id: "r1", name: "Rafiq", phone: "017" }] : [];
        return Promise.resolve({ data, error: null }).then(ok);
      };
      return chain;
    },
  };
  return { calls, service: service as never };
};

describe("buildMoneyExport", () => {
  it("reads the half-open Dhaka window from the right table and names riders", async () => {
    const { calls, service } = fakeService({ total: 3 });
    const out = await buildMoneyExport(service, "rider_wallet", range);
    expect(out).toMatchObject({ count: 3, truncated: false });
    expect(out.csv).toContain("Rafiq");
    const ledger = calls.find((c) => c.table === "rider_earnings")!;
    expect(ledger.filters).toEqual(["gte:created_at:2026-09-01T00:00:00+06:00", "lt:created_at:2026-10-01T00:00:00+06:00"]);
  });

  it("pages through more than 1000 rows", async () => {
    const { calls, service } = fakeService({ total: 2500 });
    const out = await buildMoneyExport(service, "rider_wallet", range);
    expect(out.count).toBe(2500);
    expect(calls.filter((c) => c.table === "rider_earnings").map((c) => c.from)).toEqual([0, 1000, 2000]);
  });

  it("stops at the row cap and says it was cut", async () => {
    const { service } = fakeService({ total: EXPORT_ROW_CAP + 500 });
    const out = await buildMoneyExport(service, "rider_wallet", range);
    expect(out.count).toBe(EXPORT_ROW_CAP);
    expect(out.truncated).toBe(true);
  });

  it("an empty period is a header-only file, not an error", async () => {
    const { service } = fakeService({ total: 0 });
    const out = await buildMoneyExport(service, "rider_wallet", range);
    expect(out.count).toBe(0);
    expect(out.csv.split("\r\n")).toHaveLength(2);
  });

  it("explains a missing migration (409) and hides other database errors", async () => {
    const missing = fakeService({ total: 0, ledgerError: { code: "42P01", message: "relation does not exist" } });
    await expect(buildMoneyExport(missing.service, "audit", range)).rejects.toMatchObject({ status: 409 });
    const broken = fakeService({ total: 0, ledgerError: { code: "XX000", message: "boom secret" } });
    await expect(buildMoneyExport(broken.service, "audit", range)).rejects.toThrow("money export read failed");
  });
});
