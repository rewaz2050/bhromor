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
    const { id, accountCreated } = await applyShop(body, {
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
        title: "New shop application",
        body: `${shopName} applied to sell on PROSANTI — approve it to open their dashboard.`,
        href: "/admin/shops",
      });
    }
    return apiJson(
      {
        applied: true as const,
        id,
        linked: true as const,
        account: accountCreated ? ("created" as const) : ("existing" as const),
        message:
          "Application received — sign in with this email and password as soon as PROSANTI approves it.",
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
