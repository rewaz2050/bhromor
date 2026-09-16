/**
 * GET /api/health — GO-LIVE readiness probe.
 * Verifies, step by step, that the backend is fully live: Supabase env keys
 * present, database reachable, required tables seeded, and the placement RPC
 * installed. Never leaks keys — booleans and counts only.
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { getSupabaseService } from "@/lib/supabase-server";
import {
  isCloudinaryConfigured,
  isServiceRoleConfigured,
  isSupabaseConfigured,
} from "@/lib/env";
import { apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isSupabaseConfigured();
  const serviceConfigured = isServiceRoleConfigured();

  const checks = {
    supabaseKeys: configured,
    serviceRoleKey: serviceConfigured,
    reachable: false,
    productsSeeded: false,
    zonesSeeded: false,
    shopsSeeded: false,
    couponsSeeded: false,
    adminUser: false,
    placeOrderRpc: false,
    placeOrderRpcPerUser: false,
    // 202609160002 — the order INSERT path (gift_wrap NULL + current guard
    // triggers). Without it, ps_place_order exists yet every checkout 503s.
    checkoutRepair: false,
    // 202609160003 — the order UPDATE path: status changes (admin Confirm →
    // Delivered, cancel), bKash/Nagad verify, and the rider's own delivery
    // bookkeeping. Without it orders arrive and nothing can move them.
    orderFlowRepair: false,
  };
  const counts: Record<string, number> = {};
  let checkoutRepair: Record<string, unknown> | null = null;

  if (configured) {
    try {
      const db = await getSupabaseServer();
      const probe = db
        ? await db.from("delivery_zones").select("id", { head: true, count: "exact" })
        : null;
      checks.reachable = !probe?.error;
    } catch {
      checks.reachable = false;
    }

    const svc = getSupabaseService();
    if (serviceConfigured && svc) {
      const [products, zones, shops, coupons, admins] = await Promise.all([
        svc.from("products").select("id", { head: true, count: "exact" }),
        svc.from("delivery_zones").select("id", { head: true, count: "exact" }),
        svc.from("shops").select("id", { head: true, count: "exact" }),
        svc.from("coupons").select("id", { head: true, count: "exact" }),
        svc.from("admin_users").select("id", { head: true, count: "exact" }),
      ]);
      counts.products = products.count ?? 0;
      counts.delivery_zones = zones.count ?? 0;
      counts.shops = shops.count ?? 0;
      counts.coupons = coupons.count ?? 0;
      counts.admin_users = admins.count ?? 0;
      checks.productsSeeded = counts.products > 0;
      checks.zonesSeeded = counts.delivery_zones > 0;
      checks.shopsSeeded = counts.shops > 0;
      checks.couponsSeeded = counts.coupons > 0;
      checks.adminUser = counts.admin_users > 0;

      // RPC present? P0001 (our raise) = installed; PGRST202 = missing.
      const { error } = await svc.rpc("ps_place_order", {
        p_order: {},
        p_items: [],
      });
      const code = (error as { code?: string } | null)?.code;
      checks.placeOrderRpc = code === "P0001";
      checks.placeOrderRpcPerUser = checks.placeOrderRpc; // 003+ installs the per-user build

      if (!checks.placeOrderRpc && code !== "PGRST202") {
        // Unexpected error shape — if it is NOT "function not found", treat as installed.
        checks.placeOrderRpc = code !== undefined;
      }

      // Can an order row actually be INSERTED? ps_checkout_health() ships with
      // the repair migration; a missing function IS the answer (not applied).
      const repair = await svc.rpc("ps_checkout_health");
      if (!repair.error && repair.data && typeof repair.data === "object") {
        const r = repair.data as Record<string, unknown>;
        checkoutRepair = r;
        checks.checkoutRepair =
          r.gift_wrap_nullable === true &&
          r.totals_guard_current === true &&
          r.insert_guard_current === true;
        checks.orderFlowRepair =
          r.status_update_ok === true &&
          r.payment_verify_ok === true &&
          r.rider_guard_ok === true;
      }
    }
  }

  const live =
    checks.supabaseKeys &&
    checks.serviceRoleKey &&
    checks.reachable &&
    checks.productsSeeded &&
    checks.zonesSeeded &&
    checks.shopsSeeded &&
    checks.adminUser &&
    checks.placeOrderRpc &&
    // "live" means a customer can actually place an order — not just that the
    // RPC exists. Without the repair every INSERT is refused.
    checks.checkoutRepair &&
    // …and the shop can actually move it: without 0003 every status change,
    // payment decision and rider delivery is refused by the database.
    checks.orderFlowRepair;

  const nextSteps: string[] = [];
  if (!checks.supabaseKeys) {
    nextSteps.push("Supabase keys set koren: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (Vercel env / .env.local)");
  }
  if (checks.supabaseKeys && !checks.reachable) {
    nextSteps.push("Database reach hochhe na — Supabase project pause/keys check koren");
  }
  if (checks.reachable && !checks.productsSeeded) {
    nextSteps.push("SQL schema + migrations chalaben: supabase/schema.sql, tarpor supabase/migrations/* (shob gulo, krome)");
  }
  if (checks.reachable && (!checks.productsSeeded || !checks.shopsSeeded)) {
    nextSteps.push("Catalog empty — add real products in Admin → Catalog & Products (products & coupons are never seeded — demo seeding was removed 2026-09-14; `npm run seed` only lays the store skeleton: shop, categories, zones). Zero coupons is fine — coupons are an optional lever.");
  }
  if (checks.reachable && !checks.adminUser) {
    nextSteps.push("Admin login banate `npm run grant-admin -- rahatbd2050@gmail.com --role super_admin` chalaben");
  }
  if (checks.productsSeeded && !checks.placeOrderRpc) {
    nextSteps.push("ps_place_order nai — SQL Editor-e supabase/migrations/202609120007_flat_delivery.sql chalaben (flat ৳60 delivery rule)");
  }
  if (checks.placeOrderRpc && !checks.checkoutRepair) {
    nextSteps.push(
      "Checkout order INSERT block — SQL Editor-e supabase/migrations/202609160002_order_insert_repair.sql chalaben (gift_wrap NULL + tip/gift/bKash guard fix); na chalale protita order 'Could not place the order' dibe",
    );
  }
  if (checks.placeOrderRpc && !checks.orderFlowRepair) {
    nextSteps.push(
      "Order status UPDATE block — SQL Editor-e supabase/migrations/202609160003_order_status_update_repair.sql chalaben (ledger trigger enum fix + ps_verify_payment + riders guard); na chalale admin Confirm/Cancel, bKash verify ar rider Delivered kichui kaj korbe na",
    );
  }

  return apiJson({
    live,
    checks,
    counts,
    checkoutRepair,
    nextSteps,
    cloudinary: { configured: isCloudinaryConfigured() },
    now: new Date().toISOString(),
  });
}
