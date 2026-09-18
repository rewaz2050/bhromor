/**
 * Checkout error copy — every message the order form can receive, in
 * Bangla first (UX audit 2026-09-18, P0 #6).
 *
 * The API and the database speak English (`only 2 left of "Panjabi"`,
 * `Please share a full delivery address.`, `coupon minimum not met`). Those
 * strings used to land verbatim in a small box under the form. Now
 * `friendlyOrderError()` turns each known message into a Bangla sentence the
 * shopper can act on (plus the English original for staff screenshots) and
 * `fieldForServerError()` says which input to scroll to.
 *
 * Unknown messages fall through untouched — never hide a real reason.
 */

export interface FriendlyError {
  /** Bangla headline the customer reads first. */
  bn: string;
  /** English line under it (also what staff will recognise). */
  en: string;
}

interface Rule {
  test: RegExp;
  bn: (m: RegExpMatchArray) => string;
  en?: (m: RegExpMatchArray) => string;
}

const clean = (s: string) => s.replace(/[“”"]/g, "").trim();

const RULES: Rule[] = [
  /* ---------------- database RPC (P0001) ---------------- */
  {
    test: /^only (\d+) left of [“"](.+?)[”"]/i,
    bn: (m) =>
      `“${clean(m[2])}”-এর মাত্র ${m[1]}টি স্টকে আছে — পরিমাণ কমিয়ে আবার চেষ্টা করুন।`,
  },
  {
    test: /^bad quantity$/i,
    bn: () => "একটি পণ্যের পরিমাণ ঠিক নেই — ১ থেকে ১০টির মধ্যে দিন।",
  },
  {
    test: /^coupon not found$/i,
    bn: () => "এই কুপন কোডটি পাওয়া যায়নি — বানান মিলিয়ে দেখুন বা কুপন সরিয়ে অর্ডার করুন।",
  },
  {
    test: /^coupon minimum not met$/i,
    bn: () => "এই কুপনের জন্য ন্যূনতম অর্ডার পূরণ হয়নি — আরও পণ্য যোগ করুন বা কুপন সরান।",
  },
  {
    test: /^coupon (expired|inactive|exhausted|used|limit reached|not started)/i,
    bn: () => "এই কুপনটি এখন চালু নেই — কুপন সরিয়ে অর্ডার করুন।",
  },
  {
    test: /^coupon does not apply/i,
    bn: () => "এই কুপন আপনার ব্যাগের পণ্যে প্রযোজ্য নয় — কুপন সরিয়ে অর্ডার করুন।",
  },
  {
    test: /^Zone D requires minimum ৳?(\d+) order/i,
    bn: (m) => `সুনামগঞ্জ সদরের বাইরে ডেলিভারির জন্য ন্যূনতম ৳${m[1]} অর্ডার লাগবে — আরও পণ্য যোগ করুন।`,
  },
  {
    test: /^Delivery slot full/i,
    bn: () => "এই সময়ের স্লটটি ভরে গেছে — অন্য একটি সময় বেছে নিন।",
  },
  {
    test: /^shop does not deliver to zone/i,
    bn: () => "এই দোকান আপনার এলাকায় ডেলিভারি দেয় না — অন্য ঠিকানা দিন বা স্টোর পিকআপ নিন।",
  },
  {
    test: /^(product not found|product unavailable|variant not found|variant unavailable)/i,
    bn: () => "ব্যাগের একটি পণ্য এখন আর পাওয়া যাচ্ছে না — ব্যাগ থেকে সরিয়ে আবার চেষ্টা করুন।",
  },
  {
    test: /^empty order/i,
    bn: () => "ব্যাগে কোনো পণ্য নেই — আগে পণ্য যোগ করুন।",
  },
  {
    test: /^shop (is )?closed/i,
    bn: () => "দোকানটি এখন বন্ধ — খুললে আপনার ব্যাগ থেকেই অর্ডার করতে পারবেন।",
  },
  {
    test: /^shop unavailable/i,
    bn: () => "এই দোকান এখন অর্ডার নিচ্ছে না — একটু পরে আবার চেষ্টা করুন।",
  },

  /* ---------------- server validation (422) ---------------- */
  {
    test: /^Please share your full name/i,
    bn: () => "আপনার পুরো নাম লিখুন (কমপক্ষে ২ অক্ষর)।",
  },
  {
    test: /^A valid Bangladeshi mobile number/i,
    bn: () => "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন — যেমন 017XXXXXXXX।",
  },
  {
    test: /^Please pick or type your para/i,
    bn: () => "আপনার পাড়া বা গ্রামের নাম লিখুন।",
  },
  {
    test: /^Please share a full delivery address/i,
    bn: () => "বাসা নম্বর, রোড ও ল্যান্ডমার্ক সহ পুরো ঠিকানা লিখুন (কমপক্ষে ৮ অক্ষর)।",
  },
  {
    test: /^That delivery zone is not available/i,
    bn: () => "এই ডেলিভারি এলাকা এখন চালু নেই — ঠিকানা আবার দেখুন।",
  },
  {
    test: /^The order must contain 1.20 line items/i,
    bn: () => "একটি অর্ডারে ১ থেকে ২০টি আলাদা পণ্য থাকতে পারে।",
  },
  {
    test: /^That product is not available/i,
    bn: () => "ব্যাগের একটি পণ্য এখন আর পাওয়া যাচ্ছে না — ব্যাগ থেকে সরিয়ে আবার চেষ্টা করুন।",
  },
  {
    test: /^[“"](.+?)[”"] is not available right now/i,
    bn: (m) => `“${clean(m[1])}” এই মুহূর্তে পাওয়া যাচ্ছে না — ব্যাগ থেকে সরিয়ে আবার চেষ্টা করুন।`,
  },
  {
    test: /^Quantity must be between 1 and (\d+)/i,
    bn: (m) => `প্রতিটি পণ্যের পরিমাণ ১ থেকে ${m[1]}টির মধ্যে হতে হবে।`,
  },
  {
    test: /^That variant of [“"](.+?)[”"] is not available/i,
    bn: (m) => `“${clean(m[1])}”-এর এই সাইজ/রঙ এখন নেই — অন্য ভ্যারিয়েন্ট বেছে নিন।`,
  },
  {
    test: /^Duplicate line item/i,
    bn: () => "একই পণ্য ব্যাগে দুবার আছে — একটি সরিয়ে পরিমাণ বাড়ান।",
  },
  {
    test: /^That shop isn.t taking orders right now/i,
    bn: () => "এই দোকান এখন অর্ডার নিচ্ছে না — একটু পরে আবার চেষ্টা করুন।",
  },
  {
    test: /^[“"](.+?)[”"] is closed right now/i,
    bn: (m) => `“${clean(m[1])}” এখন বন্ধ — খুললে আপনার ব্যাগ থেকেই অর্ডার করতে পারবেন।`,
  },
  {
    test: /^Unknown code/i,
    bn: () => "এই কুপন কোডটি চেনা যায়নি — বানান মিলিয়ে দেখুন।",
  },
  {
    test: /^This code (cannot be used|is not active|has expired|has been used)/i,
    bn: () => "এই কুপনটি এখন ব্যবহার করা যাচ্ছে না — কুপন সরিয়ে অর্ডার করুন।",
  },
  {
    test: /^This code does not apply to the items/i,
    bn: () => "এই কুপন আপনার ব্যাগের পণ্যে প্রযোজ্য নয়।",
  },
  {
    test: /^Add ৳?([\d,]+) more/i,
    bn: (m) => `এই কুপনের জন্য আরও ৳${m[1]} টাকার পণ্য যোগ করুন।`,
  },
  {
    test: /referral code/i,
    bn: () => "এই রেফারেল কোডটি এখানে ব্যবহার করা যাচ্ছে না — কোড সরিয়ে অর্ডার করুন।",
  },
  {
    test: /^(bKash|Nagad) is not available right now/i,
    bn: (m) => `${m[1]} এখন চালু নেই — ক্যাশ অন ডেলিভারি বেছে নিন।`,
  },
  {
    test: /^First send the total to (bKash|Nagad)/i,
    bn: (m) => `আগে ${m[1]}-এ টাকা পাঠান, তারপর যে TRXID পেয়েছেন সেটি লিখুন।`,
  },
  {
    test: /^Unknown payment method/i,
    bn: () => "পেমেন্ট পদ্ধতি ঠিক নেই — ক্যাশ অন ডেলিভারি, bKash বা Nagad বেছে নিন।",
  },
  {
    test: /^Please fix the highlighted fields/i,
    bn: () => "লাল চিহ্নিত ঘরগুলো ঠিক করুন।",
  },
  {
    test: /^Who is it for/i,
    bn: () => "উপহার কার জন্য — নামটি লিখুন।",
  },

  /* ---------------- route-level (4xx/5xx) ---------------- */
  {
    test: /^Too many attempts/i,
    bn: () => "অনেকবার চেষ্টা হয়েছে — এক মিনিট পরে আবার চেষ্টা করুন।",
  },
  {
    test: /^Invalid order data/i,
    bn: () => "অর্ডারের তথ্য ঠিকভাবে পাঠানো যায়নি — পেজ রিফ্রেশ করে আবার চেষ্টা করুন।",
  },
  {
    test: /^Online ordering is not set up yet/i,
    bn: () => "অনলাইন অর্ডার এখনো চালু হয়নি — দোকানে ফোন করে অর্ডার করুন।",
  },
  {
    test: /^Ordering is temporarily unavailable/i,
    bn: () => "অর্ডার নেওয়া সাময়িকভাবে বন্ধ — কয়েক মিনিট পরে আবার চেষ্টা করুন, বা দোকানে ফোন করুন।",
  },
  {
    test: /^Could not place the order/i,
    bn: () => "অর্ডার প্লেস করা যায়নি — আবার চেষ্টা করুন।",
  },
];

/** Bangla-first copy for a server/DB message; unknown text is passed through. */
export const friendlyOrderError = (message: string | null | undefined): FriendlyError => {
  const raw = (message ?? "").trim();
  if (!raw) {
    return {
      bn: "অর্ডার প্লেস করা যায়নি — আবার চেষ্টা করুন।",
      en: "Could not place the order — please try again.",
    };
  }
  for (const rule of RULES) {
    const m = raw.match(rule.test);
    if (m) return { bn: rule.bn(m), en: rule.en ? rule.en(m) : raw };
  }
  // Already Bangla (our own client-side copy) — show it once.
  if (/[\u0980-\u09FF]/.test(raw)) return { bn: raw, en: "" };
  return { bn: "অর্ডার প্লেস করা যায়নি।", en: raw };
};

/**
 * Which form field a server/DB message belongs to. Mirrors the field names
 * the checkout form already uses for its own validation.
 */
export const fieldForServerError = (
  field: string | null | undefined,
  message: string | null | undefined,
): string | null => {
  const f = (field ?? "").trim();
  if (f === "village" || f === "para") return "area";
  if (f.startsWith("items")) return "items";
  if (f.startsWith("gift.")) return "gift";
  if (f === "paymentRef") return "trxid";
  if (f === "payment") return "payMethod";
  if (f === "zoneId") return "area";
  if (f) return f;
  const msg = (message ?? "").toLowerCase();
  if (/coupon/.test(msg)) return "couponCode";
  if (/left of|quantity|product|variant|stock|empty order/.test(msg)) return "items";
  if (/zone d|zone/.test(msg)) return "items";
  if (/slot/.test(msg)) return "timeSlot";
  if (/trxid|bkash|nagad|payment/.test(msg)) return "trxid";
  return null;
};

/**
 * Scroll order for a set of field errors: the first field IN FORM ORDER, not
 * the first key the server happened to send.
 */
export const FIELD_ORDER: readonly string[] = [
  "items",
  "phone",
  "name",
  "district",
  "upazila",
  "area",
  "address",
  "timeSlot",
  "gift",
  "referralCode",
  "couponCode",
  "payMethod",
  "trxid",
  "order",
];

export const firstErrorField = (fields: Record<string, string>): string | null => {
  const present = Object.keys(fields).filter((k) => fields[k]);
  if (present.length === 0) return null;
  for (const key of FIELD_ORDER) if (present.includes(key)) return key;
  return present[0];
};
