/**
 * GET/PUT /api/account/addresses — the address book, across devices.
 *
 * The browser copy in `prosanti.address-book.v1` is still the working store:
 * checkout reads it synchronously and has to work with no session and no
 * network. This route is the mirror that follows a customer to their next
 * device, which is the whole point — an address saved on a phone should be
 * there on a laptop.
 *
 * PUT replaces the set rather than patching one row. The client owns the list
 * and sends it whole, so the server never has to guess which side is newer;
 * the first entry is the preferred one, exactly as the local store orders
 * them. Identity is the session cookie, never a phone in the body.
 */

import { resolveCustomer } from "@/lib/customer-auth";
import { getSupabaseService } from "@/lib/supabase-server";
import { apiError, apiJson } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { listAddresses, replaceAddresses, ADDRESS_CAP } from "@/lib/db/customer-addresses";
import { normalizePhone } from "@/lib/orders";
import type { SavedAddress } from "@/lib/address-book";

export const dynamic = "force-dynamic";

const sameOrigin = (request: Request): boolean =>
  request.headers.get("sec-fetch-site") !== "cross-site";

/** Rows the client invented are not trusted wholesale — only what it needs. */
const cleanAddress = (raw: unknown): SavedAddress | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, 300) : "");
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const id = str(a.id).slice(0, 64);
  const area = str(a.area);
  if (id === "" || area === "") return null;
  return {
    id,
    label: str(a.label),
    name: str(a.name),
    phone: str(a.phone),
    area,
    houseNo: str(a.houseNo),
    roadName: str(a.roadName),
    landmark: str(a.landmark) || undefined,
    fullAddress: str(a.fullAddress),
    note: str(a.note),
    zoneId: str(a.zoneId),
    district: str(a.district),
    upazila: str(a.upazila),
    tag: a.tag === "home" || a.tag === "office" ? a.tag : "other",
    lat: num(a.lat),
    lng: num(a.lng),
    createdAt: num(a.createdAt) ?? Date.now(),
  };
};

export async function GET(request: Request) {
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  const db = getSupabaseService();
  if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
  const { addresses, reason } = await listAddresses(db, normalizePhone(customer.phone));
  // An unmigrated table is not an error worth a red banner — the local copy
  // still works, and the account page says so in one line.
  return apiJson({ addresses, reason: reason ?? null });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return apiError("Forbidden", 403);
  const customer = await resolveCustomer(request);
  if (!customer) return apiError("আগে লগ ইন করুন।", 401);
  if (!checkRateLimit(`customer-addresses:${customer.id}`, 30, 60_000).allowed) {
    return apiError("একটু পরে চেষ্টা করুন।", 429);
  }
  const body = (await request.json().catch(() => null)) as { addresses?: unknown } | null;
  if (!Array.isArray(body?.addresses)) return apiError("ঠিকানা পাওয়া যায়নি।", 400);
  const addresses = body.addresses
    .map(cleanAddress)
    .filter((a): a is SavedAddress => a !== null)
    .slice(0, ADDRESS_CAP);
  const db = getSupabaseService();
  if (!db) return apiError("সেবা সাময়িক বন্ধ আছে।", 503);
  const outcome = await replaceAddresses(db, normalizePhone(customer.phone), addresses);
  if (outcome === "missing_table") {
    return apiJson({ saved: false, reason: "missing_table" }, 501);
  }
  if (outcome !== "saved") return apiError("ঠিকানা সেভ হয়নি।", 503);
  return apiJson({ saved: true, count: addresses.length });
}
