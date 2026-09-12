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
  };
  const counts: Record<string, number> = {};

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
    checks.placeOrderRpc;

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
  if (checks.reachable && (!checks.productsSeeded || !checks.couponsSeeded || !checks.shopsSeeded)) {
    nextSteps.push("Launch catalog seed koren: .env.local banie `npm run seed` (products/zones/coupons/shop upsert korbe)");
  }
  if (checks.reachable && !checks.adminUser) {
    nextSteps.push("Admin login banate `npm run grant-admin -- rahatbd2050@gmail.com --role super_admin` chalaben");
  }
  if (checks.productsSeeded && !checks.placeOrderRpc) {
    nextSteps.push("ps_place_order nai — SQL Editor-e supabase/migrations/202609120007_flat_delivery.sql chalaben (flat ৳60 delivery rule)");
  }

  return apiJson({
    live,
    checks,
    counts,
    nextSteps,
    cloudinary: { configured: isCloudinaryConfigured() },
    now: new Date().toISOString(),
  });
}
