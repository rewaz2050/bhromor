/**
 * GET /api/admin/growth — the P0 growth console data.
 *
 * Who is waiting for a price drop (so staff can call them), which referral
 * codes are issued, what their friends have ordered, and what the automatic
 * offers are worth right now. The settings themselves are read and written
 * through /api/admin/settings — one document, one save button, no second
 * source of truth for a number that moves money.
 */
import { staffRoute } from "../_lib";
import { listPriceWatches, listStockWatches } from "@/lib/db/growth";
import {
  approveMembership,
  listMembershipRequests,
  rejectMembership,
} from "@/lib/db/membership";
import { AdminInputError } from "@/lib/db/admin";
import { readOpsSettings } from "@/lib/db/engagement";
import { promoView } from "@/lib/promos";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const GET = staffRoute("growth", async ({ db }) => {
  const [watches, stockWatches, settings] = await Promise.all([
    listPriceWatches(db),
    listStockWatches(db),
    readOpsSettings(db),
  ]);
  const [codesRes, rewardsRes] = await Promise.all([
    db
      .from("referral_codes")
      .select("code,customer_name,customer_phone,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("referral_rewards")
      .select("code,referee_phone,friend_credit,referrer_reward,referrer_coupon_id,created_at")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const rewards = (rewardsRes.data ?? []) as {
    code: string;
    referee_phone: string;
    friend_credit: number;
    referrer_reward: number;
    referrer_coupon_id: string | null;
    created_at: string;
  }[];
  return apiJson({
    watches,
    stockWatches,
    codes: ((codesRes.data ?? []) as {
      code: string;
      customer_name: string;
      customer_phone: string;
      created_at: string;
    }[]).map((c) => ({
      code: c.code,
      name: c.customer_name,
      phone: c.customer_phone,
      createdAt: c.created_at,
      invited: rewards.filter((r) => r.code === c.code).length,
      credited: rewards.filter((r) => r.code === c.code && r.referrer_coupon_id).length,
    })),
    rewards,
    promos: promoView({ flash: settings.flash, bundle: settings.bundle }, Date.now()),
    memberships: await listMembershipRequests(db),
  });
});

/**
 * POST /api/admin/growth { action: "plus-approve" | "plus-reject", id, note? }
 * — the PROSANTI+ decision after the human checked the wallet. Approving with
 * money verified is the only way a term starts; nothing self-activates.
 */
export const POST = staffRoute(
  "growth-plus",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      id?: unknown;
      note?: unknown;
    } | null;
    const action = typeof body?.action === "string" ? body.action : "";
    const id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
    if (id === "" || (action !== "plus-approve" && action !== "plus-reject")) {
      return apiError("Send action (plus-approve | plus-reject) and the row id.", 422);
    }
    try {
      const row =
        action === "plus-approve"
          ? await approveMembership(db, id, typeof body?.note === "string" ? body.note : "")
          : await rejectMembership(db, id, typeof body?.note === "string" ? body.note : "");
      return apiJson({ membership: row });
    } catch (err) {
      if (err instanceof AdminInputError) return apiError(err.message, err.status);
      return apiError("Could not update the application — please retry.", 503);
    }
  },
  { limit: 30 },
);
