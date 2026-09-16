/**
 * GET /api/health — "live" must mean a customer can actually place an order.
 *
 * On 2026-09-16 the probe said live:true (keys, catalog, ps_place_order all
 * present) while every checkout answered "Could not place the order": the
 * order INSERT itself was refused by the schema (gift_wrap NOT NULL + the
 * phase-1 guard triggers). The probe now asks ps_checkout_health() — shipped
 * by 202609160002 — and a missing/negative answer flips live to false with a
 * next step naming that file.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  repair: null as null | { error?: { code: string }; data?: Record<string, unknown> },
}));

vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: () => true,
  isServiceRoleConfigured: () => true,
  isCloudinaryConfigured: () => false,
}));

const table = () => ({
  select: async () => ({ count: 3, error: null }),
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: async () => ({ from: table }),
  getSupabaseService: () => ({
    from: table,
    rpc: async (fn: string) => {
      if (fn === "ps_place_order") return { data: null, error: { code: "P0001", message: "empty order" } };
      if (fn === "ps_checkout_health") {
        return state.repair ?? { data: null, error: { code: "PGRST202", message: "not found" } };
      }
      return { data: null, error: { code: "PGRST202" } };
    },
  }),
}));

import { GET } from "@/app/api/health/route";

type Health = {
  live: boolean;
  checks: Record<string, boolean>;
  checkoutRepair: Record<string, unknown> | null;
  nextSteps: string[];
};

beforeEach(() => {
  state.repair = null;
});

describe("GET /api/health — checkout repair awareness", () => {
  it("is NOT live when ps_checkout_health is missing (repair never applied)", async () => {
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.placeOrderRpc).toBe(true);
    expect(body.checks.checkoutRepair).toBe(false);
    expect(body.live).toBe(false);
    expect(body.checkoutRepair).toBeNull();
    expect(body.nextSteps.join("\n")).toContain("202609160002_order_insert_repair.sql");
  });

  it("is NOT live when the probe exists but reports the old guards", async () => {
    state.repair = {
      data: {
        version: "202609160002",
        gift_wrap_nullable: false,
        totals_guard_current: true,
        insert_guard_current: true,
      },
    };
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.checkoutRepair).toBe(false);
    expect(body.live).toBe(false);
    expect(body.checkoutRepair).toMatchObject({ gift_wrap_nullable: false });
  });

  it("is live once the INSERT path is repaired", async () => {
    state.repair = {
      data: {
        version: "202609160002",
        gift_wrap_nullable: true,
        totals_guard_current: true,
        insert_guard_current: true,
        payment_methods_widened: true,
        place_order_rpc: true,
      },
    };
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.checkoutRepair).toBe(true);
    expect(body.live).toBe(true);
    expect(body.nextSteps).toEqual([]);
  });
});
