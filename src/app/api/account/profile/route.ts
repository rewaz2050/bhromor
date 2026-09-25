import { resolveCustomer } from "@/lib/customer-auth";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { profileBody, profileName, ProfileInputError } from "@/lib/profile-input";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  // Browser writes must be same-origin. Identity always comes from the cookie,
  // never an ID or phone supplied by the form.
  if (request.headers.get("sec-fetch-site") === "cross-site") return apiError("Forbidden", 403);
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  if (!checkRateLimit(`customer-profile:${customer.id}`, 20, 60_000).allowed) return apiError("একটু পরে চেষ্টা করুন।", 429);
  try {
    const body = profileBody(await request.json().catch(() => null), ["name"]);
    const name = profileName(body.name);
    const db = getSupabaseService();
    if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
    const { data, error } = await db.from("customers").update({ name }).eq("id", customer.id)
      .select("id,name,phone").single();
    if (error || !data) return apiError("প্রোফাইল সেভ হয়নি—আবার চেষ্টা করুন।", 503);
    return apiJson({ customer: data });
  } catch (err) {
    return apiError(err instanceof ProfileInputError ? err.message : "সেভ করা যায়নি।", err instanceof ProfileInputError ? 422 : 503);
  }
}
