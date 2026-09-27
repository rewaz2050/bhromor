/**
 * Review proof (UX plan §4/§7, R10) — the track page knows which order the
 * shopper is looking at (order no + phone, both already in that URL); the
 * product page's review form does not. The link "Review <piece>" stashes
 * that pair here (sessionStorage, this tab only, one hour) so the form can
 * send it along and the server can prove the purchase → "verified
 * purchase" badge + a Smart Card stamp when staff approve.
 *
 * Nothing here is trusted by the server: it re-checks the order row.
 */

export const REVIEW_PROOF_KEY = "prosanti.review-proof.v1";
const MAX_AGE_MS = 60 * 60 * 1000;

export interface ReviewProof {
  orderId: string;
  phone: string;
  productIds: string[];
  savedAt: number;
}

export const saveReviewProof = (proof: Omit<ReviewProof, "savedAt">): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(REVIEW_PROOF_KEY, JSON.stringify({ ...proof, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — the review still goes through, unproven */
  }
};

/** The proof for THIS product, or null when none / stale / another piece. */
export const readReviewProof = (productId: string, now = Date.now()): { orderId: string; phone: string } | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REVIEW_PROOF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReviewProof> | null;
    if (
      !parsed ||
      typeof parsed.orderId !== "string" ||
      typeof parsed.phone !== "string" ||
      !Array.isArray(parsed.productIds) ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    if (now - parsed.savedAt > MAX_AGE_MS) return null;
    if (!parsed.productIds.includes(productId)) return null;
    return { orderId: parsed.orderId, phone: parsed.phone };
  } catch {
    return null;
  }
};

export const __resetReviewProof = (): void => {
  try {
    window.sessionStorage.removeItem(REVIEW_PROOF_KEY);
  } catch {
    /* ignore */
  }
};
