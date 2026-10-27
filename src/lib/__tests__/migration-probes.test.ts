/**
 * /api/health names the migration file an operator must run. That only helps
 * if the names are real, each file is probed, and the ten 2026-10-25 → 27
 * permission files are covered by either a REST probe or the SQL checklist.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ROUND_MIGRATIONS,
  ROUND_MIGRATION_ORDER,
  ROUND_MIGRATION_WHY,
  rpcReady,
  type RoundProbeKey,
} from "../migration-probes";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const PERMISSION_FILES = [
  "202610250001_finance_permission_boundary.sql",
  "202610250002_shop_first_fulfilment.sql",
  "202610250003_vendor_staff_permissions.sql",
  "202610250004_finance_reporting_access.sql",
  "202610250005_rider_wallet_column_privacy.sql",
  "202610250006_rider_controls_and_ledger_retention.sql",
  "202610250007_atomic_staff_roles.sql",
  "202610260001_order_pin_privacy_and_pickup.sql",
  "202610260002_scoped_shop_fulfilment.sql",
  "202610260003_finance_self_dealing_boundary.sql",
];

const keys = Object.keys(ROUND_MIGRATIONS) as RoundProbeKey[];

describe("health migration probes", () => {
  it("names migration files that exist", () => {
    for (const key of keys) {
      expect(
        existsSync(join(MIGRATIONS, ROUND_MIGRATIONS[key])),
        `${key} → ${ROUND_MIGRATIONS[key]}`,
      ).toBe(true);
    }
  });

  it("probes every key exactly once, in dependency order", () => {
    expect(new Set(ROUND_MIGRATION_ORDER).size).toBe(
      ROUND_MIGRATION_ORDER.length,
    );
    expect([...ROUND_MIGRATION_ORDER].sort()).toEqual([...keys].sort());
  });

  it("has an actionable sentence for every key", () => {
    for (const key of keys) {
      const why = ROUND_MIGRATION_WHY[key];
      expect(typeof why, key).toBe("string");
      expect(why.trim().length, key).toBeGreaterThan(20);
    }
  });

  it("keeps the permission work ordered and gap-free", () => {
    const order = ROUND_MIGRATION_ORDER.filter((k) =>
      PERMISSION_FILES.includes(ROUND_MIGRATIONS[k]),
    );
    const files = order.map((k) => ROUND_MIGRATIONS[k]);
    // Chronological, strictly increasing: a later file may rely on an earlier one.
    expect(files).toEqual([...files].sort());
    const probed = new Set(files);
    const unprobed = PERMISSION_FILES.filter((f) => !probed.has(f));
    if (unprobed.length > 0) {
      // Only the two files PostgREST cannot observe may be missing, and the SQL
      // checklist must still name them (rows 95 and 97a–97k).
      expect(unprobed.sort()).toEqual([
        "202610250002_shop_first_fulfilment.sql",
        "202610250004_finance_reporting_access.sql",
      ]);
      const checklist = readFileSync(
        join(process.cwd(), "supabase/check-migrations-all.sql"),
        "utf8",
      );
      for (const file of unprobed) expect(checklist).toContain(file);
    }
  });

  it("maps each permission probe onto the artefact its migration adds", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/migration-probes.ts"),
      "utf8",
    );
    const expected: Array<[RoundProbeKey, string]> = [
      ["financeBoundaryReady", "ps_can_manage_finance"],
      ["delegatedStaffReady", "vendor_users"],
      ["riderWalletPrivacyReady", "ps_read_riders"],
      ["riderControlsReady", "rider_control_audit"],
      ["staffRoleReady", "staff_role_audit"],
      ["orderPinReady", "order_operations"],
      ["shopScopedFulfilmentReady", "ps_vendor_advance_order"],
      ["financeSelfDealingReady", "ps_guard_self_finance"],
    ];
    for (const [key, artefact] of expected) {
      expect(ROUND_MIGRATIONS[key].startsWith("2026102"), key).toBe(true);
      // The last occurrence is the result assignment (the earlier ones are the
      // type, the file map and the order list); it must read from the probe.
      const at = src.lastIndexOf(`${key}:`);
      expect(at, key).toBeGreaterThan(-1);
      const assignment = src.slice(at, src.indexOf("\n", at));
      expect(assignment, key).toMatch(/^\w+Ready: \w+(\.ready)?,$/);
      expect(src, key).toContain(artefact.split(".")[0]);
    }
  });
});

/**
 * rpcReady is the difference between "this migration has not run" and "the
 * function ran and refused". Getting it backwards would either hide a missing
 * migration or invent one, so pin the four answers PostgREST can give.
 */
describe("rpcReady", () => {
  const client = (reply: unknown) =>
    ({ rpc: async () => reply }) as unknown as SupabaseClient;

  it("is true when the probe call succeeds", async () => {
    expect(await rpcReady(client({ data: null, error: null }), "ps_can_manage_finance")).toBe(true);
  });

  it("is false only when PostgREST says the function is absent", async () => {
    expect(await rpcReady(client({ data: null, error: { code: "PGRST202" } }), "x")).toBe(false);
    expect(await rpcReady(client({ data: null, error: { code: "42883" } }), "x")).toBe(false);
    expect(
      await rpcReady(
        client({ data: null, error: { message: "Could not find the function public.x in the schema cache" } }),
        "x",
      ),
    ).toBe(false);
    expect(
      await rpcReady(client({ data: null, error: { message: 'function public.x() does not exist' } }), "x"),
    ).toBe(false);
  });

  it("treats an authorization or guard refusal as proof the function exists", async () => {
    expect(
      await rpcReady(client({ data: null, error: { code: "42501", message: "permission denied for function" } }), "x"),
    ).toBe(true);
    expect(
      await rpcReady(client({ data: null, error: { code: "P0001", message: "forbidden: shop fulfilment targets only" } }), "x"),
    ).toBe(true);
  });

  it("is false when the request itself throws (network, DNS, bad env)", async () => {
    const broken = {
      rpc: async () => {
        throw new Error("fetch failed");
      },
    } as unknown as SupabaseClient;
    expect(await rpcReady(broken, "x")).toBe(false);
  });

  it("passes the named arguments PostgREST needs to resolve the overload", async () => {
    const calls: Array<{ fn: string; args: unknown }> = [];
    const recording = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;
    await rpcReady(recording, "ps_vendor_advance_order", { p_order_id: null, p_to: null, p_note: null });
    expect(calls[0]).toEqual({
      fn: "ps_vendor_advance_order",
      args: { p_order_id: null, p_to: null, p_note: null },
    });

    // Those names must be the ones the migrations declare, otherwise the probe
    // answers PGRST202 forever and a healthy database looks un-migrated.
    const orderSql = readFileSync(join(MIGRATIONS, "202610260002_scoped_shop_fulfilment.sql"), "utf8");
    for (const arg of ["p_order_id", "p_to", "p_note"]) expect(orderSql).toContain(arg);
    const selfSql = readFileSync(join(MIGRATIONS, "202610260003_finance_self_dealing_boundary.sql"), "utf8");
    expect(selfSql).toContain("p_rider_id uuid");
  });
});
