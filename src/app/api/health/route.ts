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
import { isPushConfigured, pushSubscriptionsReady } from "@/lib/push";
import { customerPushReady } from "@/lib/customer-push";
import { cronStatus } from "@/lib/cron";
import { apiJson } from "@/lib/api-response";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

/**
 * Who may see the full report (audit L6). Anyone can read `live` (a bare
 * boolean for uptime monitors); the per-table counts, seeded flags and
 * repair status go only to a signed-in staff session (cookie or bearer —
 * the admin dashboard banner and the owner's own browser tab) or to a
 * caller presenting HEALTH_TOKEN in `x-health-token` (external monitors).
 */
const mayReadDetails = async (request: Request | undefined): Promise<boolean> => {
  const token = process.env.HEALTH_TOKEN?.trim();
  if (token && request?.headers.get("x-health-token") === token) return true;
  try {
    await requireStaff();
    return true;
  } catch {
    return false;
  }
};

export async function GET(request?: Request) {
  const detailed = await mayReadDetails(request);
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
    // 202609160004 — the public anon key can no longer call the service-only
    // RPCs (ps_place_order, ps_use_coupon, ps_book_delivery_slot, …) and
    // `memberships` is actually protected by its policy. Ordering works
    // without it; the shop is simply exposed until it runs.
    securityRepair: false,
    // 202609160005 — a delivery offer can be re-issued after it expires or a
    // rider rejects it (UNIQUE(order_id) replaced by one-live-offer index),
    // and staff batch assign exists. Without it the rider job feed 503s as
    // soon as one offer lapses with a second rider online.
    dispatchRepair: false,
    // 202609170001 — two-tap order flow: ps_advance_order accepts
    // confirmed → ready-for-pickup, so admin/vendor "Ready — call rider"
    // works without a "preparing" tap in between. Without it the button
    // gets a 422 ("not allowed from here") and staff must use "More… →
    // Start preparing" first.
    twoTapFlow: false,
    // 202609210001 + PUSH_VAPID_* — the owner's phone notifications. Not
    // part of `live` (orders flow without it) but it is the first thing the
    // owner asks about, so the report names it instead of staying silent.
    pushConfigured: false,
    pushTableReady: false,
    // 202609240001 — shopper (customer) Web Push: the other half of "the phone
    // buzzes", and the only automatic channel a customer has.
    customerPushTableReady: false,
    // 202609240002 — the clock (docs/automation.md): stale rider offers, the
    // ~2h delivery reminder, the 9am digest. `cronConfigured` is whether the
    // secret is set at all; `cronMarksReady` whether the migration ran;
    // `cronLastRunAt` when the GitHub Action last knocked.
    cronConfigured: false,
    cronMarksReady: false,
    cronLastRunAt: null as string | null,
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

      // Phone notifications: VAPID keys + the staff device table (202609210001).
      checks.pushConfigured = isPushConfigured();
      const pushTable = await pushSubscriptionsReady(svc);
      checks.pushTableReady = pushTable.ready;
      counts.push_subscriptions = pushTable.count;
      // …and the shopper side (202609240001).
      const customerPush = await customerPushReady(svc);
      checks.customerPushTableReady = customerPush.ready;
      counts.customer_push_subscriptions = customerPush.count;

      // The clock (202609240002) — is a scheduler wired, and did it knock?
      const cron = await cronStatus(svc);
      checks.cronConfigured = cron.configured;
      checks.cronMarksReady = cron.marksReady;
      checks.cronLastRunAt = cron.lastRunAt;

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
        checks.securityRepair =
          r.rpc_grants_locked === true && r.memberships_rls === true;
        checks.dispatchRepair = r.dispatch_reoffer_ok === true;
        checks.twoTapFlow = r.two_tap_flow_ok === true;
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
  if (checks.placeOrderRpc && checks.orderFlowRepair && !checks.securityRepair) {
    nextSteps.push(
      "Security lock — SQL Editor-e supabase/migrations/202609160004_rpc_grants_rls_repair.sql chalaben (anon key diye ps_place_order/ps_use_coupon/ps_book_delivery_slot call bondho + memberships RLS + delivery_slots policy); order flow eite bhangbe na, kintu na chalale je keu browser key diye slot full / coupon sesh / membership pora korte pare",
    );
  }
  if (checks.placeOrderRpc && checks.orderFlowRepair && !checks.dispatchRepair) {
    nextSteps.push(
      "Dispatch re-offer — SQL Editor-e supabase/migrations/202609160005_dispatch_reoffer_repair.sql chalaben (delivery_assignments UNIQUE(order_id) → one-live-offer index + batch assign fix); na chalale ekta offer expire/reject holei rider app-er job list 503 dibe ar Admin → Deliveries batch assign kaj korbe na",
    );
  }
  if (checks.placeOrderRpc && checks.orderFlowRepair && !checks.twoTapFlow) {
    nextSteps.push(
      "Two-tap order flow — SQL Editor-e supabase/migrations/202609170001_two_tap_order_flow.sql chalaben (ps_advance_order: confirmed → ready-for-pickup allow); na chalale admin/vendor-er 'Ready — call rider' button 422 dibe, age 'More… → Start preparing' chapte hobe",
    );
  }
  if (checks.reachable && !checks.pushConfigured) {
    nextSteps.push(
      "Phone notification off — host env e PUSH_VAPID_PUBLIC_KEY + PUSH_VAPID_PRIVATE_KEY set korun (npx web-push generate-vapid-keys), tarpor Admin → Notifications → 'Phone notification ON korun'. Key chara /admin/notifications card ta ON button dey na",
    );
  }
  if (checks.reachable && checks.pushConfigured && !checks.pushTableReady) {
    nextSteps.push(
      "Phone notification er device table nai — SQL Editor-e supabase/migrations/202609210001_push_subscriptions.sql chalaben; na chalale ON button e chap dile 'push_subscriptions table nai' asbe",
    );
  }
  if (checks.reachable && checks.pushConfigured && !checks.customerPushTableReady) {
    nextSteps.push(
      "Customer notification er table nai — SQL Editor-e supabase/migrations/202609240001_customer_push.sql chalaben; na chalale /track er 'ফোনে খবর নিন' button kaaj korbe na",
    );
  }
  if (checks.reachable && !checks.cronConfigured) {
    nextSteps.push(
      "Scheduler bondho — Vercel env e CRON_SECRET set korun, sei value-i GitHub → Secrets and variables → Actions e CRON_SECRET hisebe rakhun (docs/automation.md). Na dile rider offer expiry, 2 ghontar delivery reminder ar sokaler digest cholbe na",
    );
  }
  if (checks.reachable && checks.cronConfigured && !checks.cronMarksReady) {
    nextSteps.push(
      "Scheduler er marks table nai — SQL Editor-e supabase/migrations/202609240002_cron_marks.sql chalaben; na chalale reminder/digest bad pore (offer sweep cholbe)",
    );
  }
  if (checks.reachable && checks.cronConfigured && checks.cronMarksReady && !checks.cronLastRunAt) {
    nextSteps.push(
      "Scheduler ekbaro choleni — GitHub → Actions → 'Shop clock' → Run workflow, tarpor 15 minute por abar dekhun (docs/automation.md)",
    );
  }

  const now = new Date().toISOString();
  if (!detailed) {
    // Public shape: is the shop taking orders — nothing about how it is built.
    return apiJson({ live, now });
  }

  return apiJson({
    live,
    checks,
    counts,
    checkoutRepair,
    nextSteps,
    cloudinary: { configured: isCloudinaryConfigured() },
    now,
  });
}
