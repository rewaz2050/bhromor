/**
 * POST /api/shops/apply — public shop application intake (slice 2; 2026-09-26
 * apply = sign up).
 *
 * The application carries the email + password that become the vendor
 * login: the account, the pending shop row and the owner link are created
 * together, and the admin's approval is what opens the dashboard. Tight
 * rate limit: applications are rare and the endpoint writes to the
 * database and to Auth. An unconfigured backend answers 503.
 */

import { ShopInputError, applyShop } from "@/lib/db/marketplace";
import { ApplicantAccountError } from "@/lib/db/applicant-account";
import { notifyStaff } from "@/lib/db/engagement";
import { isServiceRoleConfigured } from "@/lib/env";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getSupabaseServer, getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { loginHandleFor } from "@/lib/phone-login";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const bucket = checkRateLimit(`shops-apply:${ip}`, 5, 60_000);
  if (!bucket.allowed) {
    const res = apiError("Too many attempts — please wait a moment.", 429);
    res.headers.set("Retry-After", String(bucket.retryAfterSec));
    return res;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid application.", 400);
  }
  if (!isServiceRoleConfigured()) {
    return apiError("Shop applications are not open yet.", 503);
  }
  try {
    // A signed-in applicant (an account made under the old two-step flow)
    // links that login instead of creating a new one.
    let applicantUserId: string | undefined;
    let applicantEmail: string | null = null;
    try {
      const session = await getSupabaseServer();
      const { data } = (await session?.auth.getUser()) ?? { data: null };
      applicantUserId = data?.user?.id;
      applicantEmail = data?.user?.email ?? null;
    } catch {
      applicantUserId = undefined;
    }
    const fields = (body ?? {}) as Record<string, unknown>;
    const { id, accountCreated, loginEmail, resubmitted } = await applyShop(body, {
      applicantUserId,
      applicantEmail,
      password: typeof fields.password === "string" ? fields.password : undefined,
    });
    const staffDb = getSupabaseService();
    if (staffDb) {
      const shopName =
        typeof fields.name === "string"
          ? fields.name.trim().slice(0, 80)
          : "A shop";
      await notifyStaff(staffDb, {
        kind: "system",
        title: resubmitted ? "Shop application re-submitted" : "New shop application",
        body: resubmitted
          ? `${shopName} fixed their details after a rejection and applied again — review it in the pending queue.`
          : `${shopName} applied to sell on PROSANTI — approve it to open their dashboard.`,
        href: "/admin/shops",
      });
    }
    return apiJson(
      {
        applied: true as const,
        id,
        linked: true as const,
        account: accountCreated ? ("created" as const) : ("existing" as const),
        // Round 4 — what to type in the login box: the e-mail, or the mobile
        // number for a phone login (the synthetic address stays server-side).
        login: loginHandleFor(loginEmail),
        resubmitted,
        message: resubmitted
          ? "Application re-submitted — it is back in PROSANTI's review queue; sign in with the same details once it is approved."
          : "Application received — sign in with these details as soon as PROSANTI approves it.",
      },
      201,
    );
  } catch (err) {
    if (err instanceof ShopInputError || err instanceof ApplicantAccountError) {
      return apiError(err.message, err.status);
    }
    return apiError("Could not save the application.", 503);
  }
}
