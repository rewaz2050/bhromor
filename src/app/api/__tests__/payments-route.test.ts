import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ops: { wallets: { bkash: "01700000001", nagad: "" } } as Record<string, unknown>,
  shops: [] as Record<string, unknown>[],
  shopsError: null as { message: string } | null,
  shopQuery: [] as unknown[],
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({
    from: (table: string) => {
      if (table === "site_settings") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: state.ops }, error: null }) }) }) };
      }
      return {
        select: () => ({
          in: async (_col: string, ids: unknown) => {
            state.shopQuery.push(ids);
            return { data: state.shopsError ? null : state.shops, error: state.shopsError };
          },
        }),
      };
    },
  }),
}));

import { GET } from "../payments/route";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const get = async (qs = "") => (await GET(new Request(`http://localhost/api/payments${qs}`))).json();

beforeEach(() => {
  state.ops = { wallets: { bkash: "01700000001", nagad: "" } };
  state.shops = [];
  state.shopsError = null;
  state.shopQuery = [];
});

describe("GET /api/payments", () => {
  it("offers PROSANTI's configured numbers by default, omitting an empty method", async () => {
    expect(await get()).toEqual({ bkash: "01700000001", payTo: "platform" });
    expect(state.shopQuery).toHaveLength(0);
  });

  it("keeps PROSANTI's numbers for ordinary shops", async () => {
    state.shops = [{ id: A, name: "Plain", settlement_model: "platform" }];
    expect(await get(`?shops=${A}`)).toEqual({ bkash: "01700000001", payTo: "platform" });
  });

  it("offers a single shop's OWN number when it sells into its own wallet", async () => {
    state.shops = [{ id: A, name: "Rafiq Store", settlement_model: "shop_wallet", wallet_bkash: "+8801811111111", wallet_nagad: null }];
    expect(await get(`?shops=${A}`)).toEqual({ bkash: "01811111111", payTo: "shop", payeeName: "Rafiq Store" });
  });

  it("gives a mixed bag no wallet at all (COD only)", async () => {
    state.shops = [
      { id: A, name: "Own", settlement_model: "shop_wallet", wallet_bkash: "01811111111" },
      { id: B, name: "Plain", settlement_model: "platform" },
    ];
    expect(await get(`?shops=${A},${B}`)).toEqual({ payTo: "shop" });
  });

  it("ignores junk ids and does not query for them", async () => {
    expect(await get("?shops=not-an-id,;drop")).toEqual({ bkash: "01700000001", payTo: "platform" });
    expect(state.shopQuery).toHaveLength(0);
  });

  it("falls back to PROSANTI's numbers on a database without the migration", async () => {
    state.shopsError = { message: "column shops.settlement_model does not exist" };
    expect(await get(`?shops=${A}`)).toEqual({ bkash: "01700000001", payTo: "platform" });
  });
});
