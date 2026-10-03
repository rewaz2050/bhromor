import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listMoneyAudit } from "../money-audit";

const client = (result: { data?: unknown; error?: { code?: string; message: string } | null }, seen: string[] = []) => ({
  from: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    chain.limit = (n: number) => { seen.push(`limit:${n}`); return chain; };
    chain.eq = (c: string, v: string) => { seen.push(`${c}=${v}`); return chain; };
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, ...result }).then(ok);
    return chain;
  },
});

describe("listMoneyAudit (audit T)", () => {
  it("maps rows and applies the filter + limit", async () => {
    const seen: string[] = [];
    const out = await listMoneyAudit(
      client({ data: [{ id: "a", at: "2026-10-01T10:00:00Z", actor_id: "u", actor_email: "o@x.test", event: "shop_payout", subject_type: "shop", subject_id: "s1", amount: "90000", detail: { method: "bkash" } }] }, seen) as never,
      { event: "shop_payout", limit: 25 },
    );
    expect(seen).toEqual(["limit:25", "event=shop_payout"]);
    expect(out?.[0]).toMatchObject({ id: "a", amount: 90000, actorEmail: "o@x.test", subjectType: "shop" });
    expect(out?.[0].at).toBe(Date.parse("2026-10-01T10:00:00Z"));
  });

  it("is null before the migration, and throws on a real failure", async () => {
    expect(await listMoneyAudit(client({ error: { code: "42P01", message: 'relation "money_audit_log" does not exist' } }) as never, { limit: 5 })).toBeNull();
    await expect(listMoneyAudit(client({ error: { message: "boom" } }) as never, { limit: 5 })).rejects.toThrow("audit read failed");
  });
});
