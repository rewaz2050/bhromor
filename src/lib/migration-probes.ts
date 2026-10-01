/**
 * Migration probes for /api/health — the round files from 2026-09-26 onward
 * (plus the 2026-09-30 rider-money pair), each answered from the live database
 * through PostgREST (no SQL access needed): a missing table (42P01 / PGRST205) or a missing column
 * (42703 / PGRST204) means "that file has not run"; any other error means
 * the artefact exists (the probe only asks whether it is there).
 *
 * Why columns for the free-delivery file: `202609260003` is one transaction
 * whose proof block raises unless `ps_place_order` came out patched, so the
 * two columns being present means the function was patched in the same run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type DbError = { code?: string; message?: string } | null | undefined;

const missingTable = (error: DbError): boolean => {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    /relation .* does not exist/.test(message) ||
    message.includes("schema cache")
  );
};

const missingColumn = (error: DbError): boolean => {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "42703" ||
    code === "PGRST204" ||
    /column .* does not exist/.test(message) ||
    message.includes("could not find the") // PostgREST: "Could not find the 'x' column of 'y'"
  );
};

/** Is the table there? Count comes free (service role, RLS bypassed). */
export const tableReady = async (
  db: SupabaseClient,
  table: string,
): Promise<{ ready: boolean; count: number }> => {
  try {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) return { ready: !missingTable(error), count: 0 };
    return { ready: true, count: count ?? 0 };
  } catch {
    return { ready: false, count: 0 };
  }
};

/** Is the column there? (`select column limit 1` — 42703 when it is not.) */
export const columnReady = async (
  db: SupabaseClient,
  table: string,
  column: string,
): Promise<boolean> => {
  try {
    const { error } = await db.from(table).select(column).limit(1);
    if (!error) return true;
    return !(missingColumn(error) || missingTable(error));
  } catch {
    return false;
  }
};

export type RoundProbeKey =
  | "passwordResetReady"
  | "applicationReviewReady"
  | "freeDeliveryReady"
  | "storefrontEventsReady"
  | "pushBroadcastsReady"
  | "shopCoverReady"
  | "bagSnapshotsReady"
  | "reviewStampsReady"
  | "riderEarningsReady"
  | "riderPayoutsReady"
  | "riderFixesReady";

export type RoundProbes = Record<RoundProbeKey, boolean> & {
  counts: Record<string, number>;
};

/** Which file installs which flag — the next-step text names it. */
export const ROUND_MIGRATIONS: Record<RoundProbeKey, string> = {
  passwordResetReady: "202609260001_password_reset_requests.sql",
  applicationReviewReady: "202609260002_application_review.sql",
  freeDeliveryReady: "202609260003_free_delivery.sql",
  storefrontEventsReady: "202609260004_storefront_events.sql",
  pushBroadcastsReady: "202609270001_push_broadcasts.sql",
  shopCoverReady: "202609270002_shop_cover.sql",
  bagSnapshotsReady: "202609270003_bag_snapshots.sql",
  reviewStampsReady: "202609270004_review_stamps.sql",
  riderEarningsReady: "202609300001_rider_delivery_accounting.sql",
  riderPayoutsReady: "202609300002_rider_money.sql",
  riderFixesReady: "202610010001_rider_fixes_phase_a.sql",
};

/** The order to run them in — 270003 needs 270001 (its cron touches push). */
export const ROUND_MIGRATION_ORDER: RoundProbeKey[] = [
  "passwordResetReady",
  "applicationReviewReady",
  "freeDeliveryReady",
  "storefrontEventsReady",
  "pushBroadcastsReady",
  "shopCoverReady",
  "bagSnapshotsReady",
  "reviewStampsReady",
  "riderEarningsReady",
  "riderPayoutsReady",
  "riderFixesReady",
];

/** What breaks without each file — shown as the health report's next step. */
export const ROUND_MIGRATION_WHY: Record<RoundProbeKey, string> = {
  passwordResetReady:
    "na chalale vendor/rider 'পাসওয়ার্ড ভুলে গেছেন?' request pathate parbe na (login page 503)",
  applicationReviewReady:
    "na chalale Admin → Shops / Riders er Approve / Reject strip 503 dibe ar rider KYC upload bondho thakbe",
  freeDeliveryReady:
    "na chalale Admin/Vendor er free delivery minimum save 503 dibe ar checkout delivery charge agei moto nibe (bag e 'free' dekhale o)",
  storefrontEventsReady:
    "na chalale Admin → Reports er Funnel card 'Not installed yet' dekhabe (storefront events jomche na)",
  pushBroadcastsReady:
    "na chalale tracker card er 'নতুন ড্রপ ও অফারের খবর' opt-in ar Admin → Growth broadcast 503 dibe",
  shopCoverReady:
    "na chalale Vendor → Settings er cover chobi save hobe na (shop page/card e cover asbe na)",
  bagSnapshotsReady:
    "na chalale abandoned-bag reminder (30 min por 'আপনার ব্যাগে … অপেক্ষা করছে') ar bag snapshot save hobe na",
  reviewStampsReady:
    "na chalale review approve korle smart card e stamp jog hobe na ar 'verified' review er order-ref rakha jabe na",
  riderEarningsReady:
    "na chalale rider tip order theke 100% rider-er wallet-e credit hobe na (UI promise thakleo) ar 7-diner delivery counter purano orders.updated_at onujayi bhul marte pare",
  riderPayoutsReady:
    "na chalale rider per-delivery fee (Admin → Money te set kora) wallet-e joma hobe na, /rider/earnings page 'আয়ের পেজ এখনো চালু হয়নি' dekhabe ar kono payout request neoya jabe na",
  riderFixesReady:
    "na chalale rider-er payout/COD handling fee bhul hishab thakbe (return-e fee), 'delivery fail' report staff-er kache pouchabe na (job atke thakbe) ar admin 'Release rider' / failed-delivery redispatch kaj korbe na",
};

/** All of them, in parallel — one round trip each. */
export const roundProbes = async (db: SupabaseClient): Promise<RoundProbes> => {
  const [
    passwordReset,
    shopReviewNote,
    riderKyc,
    shopFreeDeliveryMin,
    orderFreeDeliveryBy,
    storefrontEvents,
    pushBroadcasts,
    pushMarketing,
    shopCoverUrl,
    bagSnapshots,
    stampLedger,
    reviewOrderRef,
    riderEarningsTable,
    riderWalletColumn,
    riderPayoutsTable,
    deliveryFailedColumn,
  ] = await Promise.all([
    tableReady(db, "password_reset_requests"),
    columnReady(db, "shops", "review_note"),
    columnReady(db, "riders", "kyc"),
    columnReady(db, "shops", "free_delivery_min"),
    columnReady(db, "orders", "free_delivery_by"),
    tableReady(db, "storefront_events"),
    tableReady(db, "push_broadcasts"),
    columnReady(db, "customer_push_subscriptions", "marketing"),
    columnReady(db, "shops", "cover_url"),
    tableReady(db, "bag_snapshots"),
    tableReady(db, "stamp_ledger"),
    columnReady(db, "reviews", "order_ref"),
    tableReady(db, "rider_earnings"),
    columnReady(db, "riders", "earnings_balance"),
    tableReady(db, "rider_payout_requests"),
    columnReady(db, "orders", "delivery_failed_at"),
  ]);

  return {
    passwordResetReady: passwordReset.ready,
    applicationReviewReady: shopReviewNote && riderKyc,
    freeDeliveryReady: shopFreeDeliveryMin && orderFreeDeliveryBy,
    storefrontEventsReady: storefrontEvents.ready,
    pushBroadcastsReady: pushBroadcasts.ready && pushMarketing,
    shopCoverReady: shopCoverUrl,
    bagSnapshotsReady: bagSnapshots.ready,
    reviewStampsReady: stampLedger.ready,
    // reviews.order_ref rides with stamp_ledger in the same file; if only one
    // of the two is there the flag stays false so the next step names the file.
    ...(stampLedger.ready && !reviewOrderRef ? { reviewStampsReady: false } : {}),
    // 202609300001 — both artefacts ship in one transaction; either missing
    // means the tip wallet / delivered_at stamp has not landed.
    riderEarningsReady: riderEarningsTable.ready && riderWalletColumn,
    // 202609300002 — the payout table ships with the per-delivery fees and the
    // two money RPCs; its presence is the honest "Phase 2 has landed" signal.
    riderPayoutsReady: riderPayoutsTable.ready,
    // 202610010001 — Phase A fixes ship in one transaction; the failed-delivery
    // column is the visible artefact (the RPCs ride in the same file).
    riderFixesReady: deliveryFailedColumn,
    counts: {
      password_reset_requests: passwordReset.count,
      storefront_events: storefrontEvents.count,
      push_broadcasts: pushBroadcasts.count,
      bag_snapshots: bagSnapshots.count,
      stamp_ledger: stampLedger.count,
      rider_earnings: riderEarningsTable.count,
      rider_payout_requests: riderPayoutsTable.count,
    },
  };
};
