/**
 * Rider KYC documents (round 4, 2026-09-26).
 *
 * A pending rider uploads photos of their NID (both sides), a selfie and —
 * for motorised vehicles — the driving licence from the /rider/login status
 * card. The URLs land in `riders.kyc` (jsonb: doc id → https URL) and staff
 * see them on the Admin → Riders card before pressing Approve. Nothing here
 * talks to the network: this module is the shared vocabulary for the rider
 * form, the API validation and the admin card.
 */

export const KYC_DOC_IDS = ["nid_front", "nid_back", "selfie", "license"] as const;
export type KycDocId = (typeof KYC_DOC_IDS)[number];

/** Vehicles for which a driving licence is part of the required set. */
export const LICENCE_VEHICLES: ReadonlySet<string> = new Set(["bike", "scooter"]);

export interface KycDocSpec {
  id: KycDocId;
  /** Bangla label (rider app). */
  bn: string;
  /** English label (admin). */
  en: string;
  /** Short helper line under the upload button (Bangla). */
  hintBn: string;
  /** Required for every rider, or only for licence vehicles? */
  required: "always" | "licence-vehicles";
}

export const KYC_DOCS: readonly KycDocSpec[] = [
  {
    id: "nid_front",
    bn: "জাতীয় পরিচয়পত্র (NID) — সামনের দিক",
    en: "NID — front",
    hintBn: "ছবি ও নাম স্পষ্ট দেখা যায় এমনভাবে তুলুন।",
    required: "always",
  },
  {
    id: "nid_back",
    bn: "জাতীয় পরিচয়পত্র (NID) — পেছনের দিক",
    en: "NID — back",
    hintBn: "ঠিকানা ও বারকোড যেন ঝাপসা না হয়।",
    required: "always",
  },
  {
    id: "selfie",
    bn: "নিজের সেলফি (NID হাতে ধরে)",
    en: "Selfie holding the NID",
    hintBn: "মুখ ও NID একই ছবিতে থাকতে হবে।",
    required: "always",
  },
  {
    id: "license",
    bn: "ড্রাইভিং লাইসেন্স",
    en: "Driving licence",
    hintBn: "মোটরবাইক / স্কুটার চালালে বাধ্যতামূলক; সাইকেল হলে লাগবে না।",
    required: "licence-vehicles",
  },
];

/** Stored shape — every key optional; unknown keys are ignored. */
export type RiderKyc = Partial<Record<KycDocId, string>>;

export const isKycDocId = (value: unknown): value is KycDocId =>
  typeof value === "string" && (KYC_DOC_IDS as readonly string[]).includes(value);

/** Only recognised doc ids with https URLs survive (defensive read of jsonb). */
export const normalizeKyc = (raw: unknown): RiderKyc => {
  const out: RiderKyc = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isKycDocId(key) && typeof value === "string" && /^https:\/\//.test(value)) {
      out[key] = value;
    }
  }
  return out;
};

/** The doc ids this rider must supply, given their vehicle. */
export const requiredKycDocs = (vehicle: string): KycDocId[] =>
  KYC_DOCS.filter(
    (d) => d.required === "always" || (d.required === "licence-vehicles" && LICENCE_VEHICLES.has(vehicle)),
  ).map((d) => d.id);

export interface KycProgress {
  required: KycDocId[];
  done: KycDocId[];
  missing: KycDocId[];
  complete: boolean;
}

export const kycProgress = (kyc: RiderKyc | null | undefined, vehicle: string): KycProgress => {
  const required = requiredKycDocs(vehicle);
  const have = normalizeKyc(kyc ?? {});
  const done = required.filter((id) => typeof have[id] === "string");
  const missing = required.filter((id) => !have[id]);
  return { required, done, missing, complete: missing.length === 0 };
};

/**
 * Accept only Cloudinary delivery URLs for the configured cloud (or any
 * Cloudinary cloud when none is configured, e.g. tests) — never an
 * arbitrary link a client could paste.
 */
export const isAcceptableKycUrl = (url: string, cloudName?: string | null): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "res.cloudinary.com") return false;
  if (url.length > 600) return false;
  const [, cloud] = parsed.pathname.split("/");
  if (cloudName && cloud !== cloudName) return false;
  return /\/image\/upload\//.test(parsed.pathname);
};
