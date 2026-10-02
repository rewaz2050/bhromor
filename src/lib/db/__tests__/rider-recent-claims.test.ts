import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listRiderRecentClaims } from "../riders";

const client = (result: { data: unknown; error: unknown }, log: string[]) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) {
      chain[m] = (...a: unknown[]) => {
        log.push(`${table}.${m}(${a.join(",")})`);
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
    return chain;
  },
});

describe("listRiderRecentClaims", () => {
  it("returns this rider's claims of every status with the decision time and note", async () => {
    const log: string[] = [];
    const out = await listRiderRecentClaims(
      client({
        data: [
          { id: "c1", rider_id: "r1", amount: 5000, method: "bkash", reference: "TX", status: "rejected", created_at: "2026-10-01T04:00:00Z", decided_at: "2026-10-01T06:00:00Z", decided_by: "u", note: "TRX মেলেনি" },
          { id: "c2", rider_id: "r1", amount: 100, method: "cash", reference: "", status: "pending", created_at: "2026-10-01T08:00:00Z", decided_at: null, decided_by: null, note: null },
        ],
        error: null,
      }, log) as never,
      "r1",
    );
    expect(log).toContain("rider_settle_claims.eq(rider_id,r1)");
    expect(out[0]).toMatchObject({ id: "c1", status: "rejected", note: "TRX মেলেনি", decidedAt: Date.parse("2026-10-01T06:00:00Z") });
    expect(out[1]).toMatchObject({ status: "pending", decidedAt: undefined, note: undefined });
  });

  it("is simply empty when the claims table is not migrated", async () => {
    expect(await listRiderRecentClaims(client({ data: null, error: { message: "relation does not exist" } }, []) as never, "r1")).toEqual([]);
  });
});
