/**
 * Customer accounts — server side (live mode).
 *
 * Signup is deliberately verification-free: phone + password creates the
 * account and a session cookie in one step ("sign up korar pore sathe sathe
 * login korte parbe"). Sessions are opaque random tokens in
 * `customer_sessions`; the httpOnly cookie never exposes the customer id.
 * Passwords are scrypt-hashed (salted, timing-safe compare).
 *
 * Demo mode never touches this module — the browser-local store in
 * customer-session.ts handles it client-side.
 */

import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { getSupabaseService } from "./supabase-server";
import { isServiceRoleConfigured } from "./env";
import { normalizePhone, samePhone } from "./orders";

export const CUSTOMER_COOKIE = "ps_customer";
export const SESSION_DAYS = 30;

const KEYLEN = 64;

export interface CustomerInfo {
  id: string;
  name: string;
  phone: string;
}

export class CustomerAuthError extends Error {
  status: number;
  /** True when the accounts tables themselves are missing (42P01): callers
   *  should answer `{ demoMode: true }` so the storefront's browser-local
   *  store takes over instead of failing the customer. */
  storeMissing: boolean;
  constructor(message: string, status = 400, storeMissing = false) {
    super(message);
    this.status = status;
    this.storeMissing = storeMissing;
  }
}

/** Postgres "relation does not exist" / PostgREST schema-cache miss. */
export const isMissingTableError = (
  error: { code?: string; message?: string } | null | undefined,
): boolean =>
  error?.code === "42P01" ||
  /does not exist/i.test(error?.message ?? "") ||
  /schema cache/i.test(error?.message ?? "");

const MISSING_STORE_MESSAGE =
  "accounts store missing — run supabase/migrations/202609110004_customer_accounts.sql";

type ServiceDb = NonNullable<ReturnType<typeof getSupabaseService>>;

/** Cheap probe: are the customer account tables reachable at all? */
export const customerStoreReady = async (db: ServiceDb): Promise<boolean> => {
  const res = await db.from("customer_sessions").select("token").limit(1);
  return !isMissingTableError(res.error as { code?: string; message?: string });
};

/* ----------------------------- passwords ----------------------------- */

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, KEYLEN).toString("hex");
  return `s1:${salt}:${key}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const [tag, salt, key] = stored.split(":");
  if (tag !== "s1" || !salt || !key) return false;
  const candidate = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(key, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
};

/* ---------------------------- validation ----------------------------- */

/** Normalized 11-digit BD phone (01XXXXXXXXX) or null. */
export const validCustomerPhone = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const phone = normalizePhone(raw.trim());
  return /^01[0-9]{9}$/.test(phone) ? phone : null;
};

const checkName = (raw: unknown): string => {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) {
    throw new CustomerAuthError("নাম ২–৮০ অক্ষরের হতে হবে।", 422);
  }
  return name;
};

const checkPassword = (raw: unknown): string => {
  if (typeof raw !== "string" || raw.length < 6 || raw.length > 72) {
    throw new CustomerAuthError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।", 422);
  }
  return raw;
};

/* ----------------------------- accounts ------------------------------ */

export const signupCustomer = async (input: {
  name: unknown;
  phone: unknown;
  password: unknown;
}): Promise<CustomerInfo> => {
  const name = checkName(input.name);
  const phone = validCustomerPhone(input.phone);
  if (!phone) {
    throw new CustomerAuthError(
      "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678)।",
      422,
    );
  }
  const password = checkPassword(input.password);

  const db = getSupabaseService();
  if (!isServiceRoleConfigured() || !db) {
    throw new CustomerAuthError("Not configured.", 503);
  }

  const existing = await db
    .from("customers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing.error && isMissingTableError(existing.error)) {
    throw new CustomerAuthError(MISSING_STORE_MESSAGE, 503, true);
  }
  if (existing.data) {
    throw new CustomerAuthError(
      "এই নম্বরে অ্যাকাউন্ট আগেই আছে — লগ ইন করুন।",
      409,
    );
  }

  const inserted = await db
    .from("customers")
    .insert({ name, phone, password_hash: hashPassword(password) })
    .select("id, name, phone")
    .single();
  if (inserted.error) {
    if (isMissingTableError(inserted.error)) {
      throw new CustomerAuthError(MISSING_STORE_MESSAGE, 503, true);
    }
    throw new CustomerAuthError("অ্যাকাউন্ট খোলা গেল না — আবার চেষ্টা করুন।", 500);
  }
  if (!inserted.data) {
    throw new CustomerAuthError("অ্যাকাউন্ট খোলা গেল না — আবার চেষ্টা করুন।", 500);
  }
  return inserted.data as CustomerInfo;
};

export const loginCustomer = async (input: {
  phone: unknown;
  password: unknown;
}): Promise<CustomerInfo> => {
  const phone = validCustomerPhone(input.phone);
  const password = checkPassword(input.password);
  const db = getSupabaseService();
  if (!isServiceRoleConfigured() || !db) {
    throw new CustomerAuthError("Not configured.", 503);
  }
  const found = await db
    .from("customers")
    .select("id, name, phone, password_hash")
    .eq("phone", phone ?? "")
    .maybeSingle();
  if (found.error && isMissingTableError(found.error)) {
    throw new CustomerAuthError(MISSING_STORE_MESSAGE, 503, true);
  }
  const row = found.data as
    | (CustomerInfo & { password_hash: string })
    | null;
  // Same message for unknown phone and wrong password — no account probing.
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new CustomerAuthError("নম্বর বা পাসওয়ার্ড মিলছে না।", 401);
  }
  return { id: row.id, name: row.name, phone: row.phone };
};

/* ----------------------------- sessions ------------------------------ */

const newToken = (): string => randomBytes(32).toString("hex");

export const createSession = async (
  customerId: string,
): Promise<{ token: string; maxAgeSec: number }> => {
  const db = getSupabaseService();
  if (!db) throw new CustomerAuthError("Not configured.", 503);
  const token = newToken();
  const maxAgeSec = SESSION_DAYS * 24 * 60 * 60;
  const expires = new Date(Date.now() + maxAgeSec * 1000).toISOString();
  const res = await db.from("customer_sessions").insert({
    token: createHash("sha256").update(token).digest("hex"),
    customer_id: customerId,
    expires_at: expires,
  });
  if (res.error) {
    if (isMissingTableError(res.error)) {
      throw new CustomerAuthError(MISSING_STORE_MESSAGE, 503, true);
    }
    throw new CustomerAuthError("Session error.", 500);
  }
  return { token, maxAgeSec };
};

const tokenFromRequest = (request: Request): string | null => {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === CUSTOMER_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim()) || null;
    }
  }
  return null;
};

/** Resolve the signed-in customer from the session cookie (or null). */
export const resolveCustomer = async (
  request: Request,
): Promise<CustomerInfo | null> => {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const db = getSupabaseService();
  if (!db) return null;
  const hashed = createHash("sha256").update(token).digest("hex");
  const res = await db
    .from("customer_sessions")
    .select("expires_at, customers (id, name, phone)")
    .eq("token", hashed)
    .maybeSingle();
  const row = res.data as
    | { expires_at: string; customers: CustomerInfo | CustomerInfo[] | null }
    | null;
  if (!row?.customers || new Date(row.expires_at) <= new Date()) return null;
  const customer = Array.isArray(row.customers)
    ? row.customers[0]
    : row.customers;
  return customer && customer.id ? customer : null;
};

export const destroySession = async (request: Request): Promise<void> => {
  const token = tokenFromRequest(request);
  if (!token) return;
  const db = getSupabaseService();
  if (!db) return;
  await db
    .from("customer_sessions")
    .delete()
    .eq("token", createHash("sha256").update(token).digest("hex"));
};

/* ------------------------------ cookies ------------------------------ */

/**
 * Production serves over HTTPS only (Vercel) — mark the session cookie
 * `Secure` there; local `npm run dev` (http) must stay without it.
 */
const SECURE = process.env.NODE_ENV === "production" ? "; Secure" : "";

export const sessionCookie = (token: string, maxAgeSec: number): string =>
  `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${SECURE}; Max-Age=${maxAgeSec}`;

export const clearedCookie = (): string =>
  `${CUSTOMER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${SECURE}; Max-Age=0`;

/* --------------------------- loyalty target --------------------------- */

/** Smart-card stamp target from site_settings['ops'] (default 10). */
export const loadSmartCardTarget = async (): Promise<{
  enabled: boolean;
  target: number;
  rewardTitle: string;
  rewardDescription: string;
  minOrderTaka: number;
}> => {
  const db = getSupabaseService();
  let enabled = true;
  let target = 10;
  let rewardTitle = "এক্সক্লুসিভ গিফট হ্যাম্পার";
  let rewardDescription =
    "১০টি স্ট্যাম্প সম্পূর্ণ করার জন্য অভিনন্দন! পরবর্তী অর্ডারের সাথে আপনার বিশেষ উপহার পৌঁছে দেওয়া হবে।";
  let minOrderTaka = 0;
  if (db) {
    const res = await db
      .from("site_settings")
      .select("value")
      .eq("key", "ops")
      .maybeSingle();
    const ops = (res.data?.value ?? {}) as Record<string, unknown>;
    if (typeof ops.loyaltyEnabled === "boolean") enabled = ops.loyaltyEnabled;
    if (
      typeof ops.loyaltyTargetOrders === "number" &&
      ops.loyaltyTargetOrders >= 1
    ) {
      target = Math.floor(ops.loyaltyTargetOrders);
    }
    if (typeof ops.loyaltyRewardTitle === "string" && ops.loyaltyRewardTitle) {
      rewardTitle = ops.loyaltyRewardTitle;
    }
    if (
      typeof ops.loyaltyRewardDescription === "string" &&
      ops.loyaltyRewardDescription
    ) {
      rewardDescription = ops.loyaltyRewardDescription;
    }
    if (typeof ops.loyaltyMinOrderAmount === "number") {
      minOrderTaka = Math.max(0, ops.loyaltyMinOrderAmount);
    }
  }
  return { enabled, target, rewardTitle, rewardDescription, minOrderTaka };
};

export { samePhone };
