/**
 * COD netting (202610010004, audit item K) — the TS half:
 *   • a plain settle sends exactly the old three arguments (works pre-migration);
 *   • netting adds p_net_wallet, and on a database without the migration the
 *     answer names the file instead of a vague 422.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { settleRiderCashByAdmin } from "../riders";

const rpcClient = (result: { error: { code?: string; message: string } | null }) => {
  const calls: { fn: string; params: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, params: Record<string, unknown>) => {
        calls.push({ fn, params });
        return { data: null, ...result };
      },
    },
  };
};

describe("settleRiderCashByAdmin — netting (audit K)", () => {
  it("sends only the three classic arguments for a plain settle", async () => {
    const { client, calls } = rpcClient({ error: null });
    await settleRiderCashByAdmin(client as never, "r1", "cash", "ref");
    expect(calls).toEqual([
      { fn: "ps_admin_settle_rider", params: { p_rider_id: "r1", p_method: "cash", p_reference: "ref" } },
    ]);
  });

  it("adds p_net_wallet only when netting is asked for", async () => {
    const { client, calls } = rpcClient({ error: null });
    await settleRiderCashByAdmin(client as never, "r1", "cash", "", true);
    expect(calls[0].params).toMatchObject({ p_net_wallet: true });
  });

  it("names the migration when the netting signature is not installed", async () => {
    const { client } = rpcClient({
      error: { code: "PGRST202", message: "Could not find the function public.ps_admin_settle_rider(p_net_wallet) in the schema cache" },
    });
    await expect(settleRiderCashByAdmin(client as never, "r1", "cash", "", true)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("202610010004_cod_netting.sql"),
    });
  });

  it("still maps real refusals (forbidden / nothing to settle)", async () => {
    const forbidden = rpcClient({ error: { message: "forbidden" } });
    await expect(settleRiderCashByAdmin(forbidden.client as never, "r1", "cash", "", true)).rejects.toMatchObject({ status: 403 });
    const nothing = rpcClient({ error: { message: "nothing to settle" } });
    await expect(settleRiderCashByAdmin(nothing.client as never, "r1", "cash", "")).rejects.toMatchObject({ status: 422 });
  });
});
