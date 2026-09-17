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
  /** Whether the caller holds a staff session (audit L6: details are staff-only). */
  staff: true,
}));

vi.mock("@/lib/staff-auth", () => ({
  requireStaff: async () => {
    if (!state.staff) throw new Error("Please sign in again.");
    return { user: { id: "staff-1" }, role: "admin", db: null };
  },
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
  state.staff = true;
  delete process.env.HEALTH_TOKEN;
});

describe("GET /api/health — who sees what (audit L6)", () => {
  it("answers anonymous callers with the bare `live` flag only", async () => {
    state.staff = false;
    const body = (await (await GET(new Request("http://localhost/api/health"))).json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["live", "now"]);
    expect(body.live).toBe(false);
  });

  it("gives a staff session the full report", async () => {
    const body = (await (await GET()).json()) as Health;
    expect(body.checks).toBeDefined();
    expect(body.nextSteps).toBeDefined();
  });

  it("accepts HEALTH_TOKEN in x-health-token for external monitors", async () => {
    state.staff = false;
    process.env.HEALTH_TOKEN = "s3cret";
    const denied = (await (await GET(
      new Request("http://localhost/api/health", { headers: { "x-health-token": "nope" } }),
    )).json()) as Record<string, unknown>;
    expect(denied.checks).toBeUndefined();
    const ok = (await (await GET(
      new Request("http://localhost/api/health", { headers: { "x-health-token": "s3cret" } }),
    )).json()) as Health;
    expect(ok.checks).toBeDefined();
  });
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

  it("is NOT live when only the INSERT path is repaired (0002) — orders would arrive but never move", async () => {
    // A 0002-generation probe has no status_update_ok / payment_verify_ok /
    // rider_guard_ok keys at all: that IS the answer (0003 not applied).
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
    expect(body.checks.orderFlowRepair).toBe(false);
    expect(body.live).toBe(false);
    expect(body.nextSteps.join("\n")).toContain("202609160003_order_status_update_repair.sql");
    expect(body.nextSteps.join("\n")).not.toContain("202609160002_order_insert_repair.sql");
  });

  it("is NOT live when 0003 ran but one of its three repairs is still missing", async () => {
    state.repair = {
      data: {
        version: "202609160003",
        gift_wrap_nullable: true,
        totals_guard_current: true,
        insert_guard_current: true,
        status_update_ok: true,
        payment_verify_ok: true,
        rider_guard_ok: false,
      },
    };
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.orderFlowRepair).toBe(false);
    expect(body.live).toBe(false);
  });

  it("is live once both the INSERT and the UPDATE paths are repaired — and still names the 0004 security lock", async () => {
    state.repair = {
      data: {
        version: "202609160003",
        gift_wrap_nullable: true,
        totals_guard_current: true,
        insert_guard_current: true,
        status_update_ok: true,
        payment_verify_ok: true,
        rider_guard_ok: true,
        payment_methods_widened: true,
        place_order_rpc: true,
      },
    };
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.checkoutRepair).toBe(true);
    expect(body.checks.orderFlowRepair).toBe(true);
    // 0004 does not gate `live` — orders flow without it — but the probe
    // must not stay silent about an anon key that can still call the RPCs.
    expect(body.checks.securityRepair).toBe(false);
    expect(body.checks.dispatchRepair).toBe(false);
    expect(body.checks.twoTapFlow).toBe(false);
    expect(body.live).toBe(true);
    expect(body.nextSteps).toHaveLength(3);
    expect(body.nextSteps[0]).toContain("202609160004_rpc_grants_rls_repair.sql");
    expect(body.nextSteps[1]).toContain("202609160005_dispatch_reoffer_repair.sql");
    expect(body.nextSteps[2]).toContain("202609170001_two_tap_order_flow.sql");
  });

  it("reports securityRepair only when BOTH the grants and memberships RLS are in place", async () => {
    const base = {
      version: "202609160004",
      gift_wrap_nullable: true,
      totals_guard_current: true,
      insert_guard_current: true,
      status_update_ok: true,
      payment_verify_ok: true,
      rider_guard_ok: true,
      payment_methods_widened: true,
      place_order_rpc: true,
    };
    state.repair = { data: { ...base, rpc_grants_locked: true, memberships_rls: false } };
    let body = (await (await GET()).json()) as Health;
    expect(body.checks.securityRepair).toBe(false);

    state.repair = { data: { ...base, rpc_grants_locked: true, memberships_rls: true } };
    body = (await (await GET()).json()) as Health;
    expect(body.checks.securityRepair).toBe(true);
    expect(body.live).toBe(true);
    // 0005 + 202609170001 still pending → two steps left, naming the files.
    expect(body.nextSteps).toHaveLength(2);
    expect(body.nextSteps[0]).toContain("202609160005_dispatch_reoffer_repair.sql");
    expect(body.nextSteps[1]).toContain("202609170001_two_tap_order_flow.sql");
  });

  it("reports dispatchRepair from ps_checkout_health().dispatch_reoffer_ok and leaves only the two-tap step", async () => {
    state.repair = {
      data: {
        version: "202609160005",
        gift_wrap_nullable: true,
        totals_guard_current: true,
        insert_guard_current: true,
        status_update_ok: true,
        payment_verify_ok: true,
        rider_guard_ok: true,
        payment_methods_widened: true,
        place_order_rpc: true,
        rpc_grants_locked: true,
        memberships_rls: true,
        dispatch_reoffer_ok: true,
      },
    };
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.dispatchRepair).toBe(true);
    expect(body.checks.twoTapFlow).toBe(false);
    expect(body.live).toBe(true);
    expect(body.nextSteps).toHaveLength(1);
    expect(body.nextSteps[0]).toContain("202609170001_two_tap_order_flow.sql");
  });

  it("reports twoTapFlow from ps_checkout_health().two_tap_flow_ok and clears nextSteps", async () => {
    state.repair = {
      data: {
        version: "202609170001",
        gift_wrap_nullable: true,
        totals_guard_current: true,
        insert_guard_current: true,
        status_update_ok: true,
        payment_verify_ok: true,
        rider_guard_ok: true,
        payment_methods_widened: true,
        place_order_rpc: true,
        rpc_grants_locked: true,
        memberships_rls: true,
        dispatch_reoffer_ok: true,
        two_tap_flow_ok: true,
      },
    };
    const body = (await (await GET()).json()) as Health;
    expect(body.checks.twoTapFlow).toBe(true);
    expect(body.live).toBe(true);
    expect(body.nextSteps).toEqual([]);
  });
});
