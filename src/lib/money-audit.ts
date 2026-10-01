/**
 * Money audit trail (202610010006, audit item T) — the pure half: the event
 * catalogue, the filter parser and the one-line description of an entry.
 * The rows themselves are written by database triggers.
 */

export const AUDIT_EVENTS = [
  "shop_payout",
  "rider_payout_paid",
  "rider_payout_rejected",
  "rider_settle",
  "settle_claim_rejected",
  "payment_verified",
  "payment_rejected",
  "rider_adjustment",
  "rate_change",
  "wallet_numbers_changed",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const AUDIT_EVENT_LABEL: Record<AuditEvent, string> = {
  shop_payout: "Shop payout recorded",
  rider_payout_paid: "Rider payout paid",
  rider_payout_rejected: "Rider payout rejected",
  rider_settle: "Rider COD settled",
  settle_claim_rejected: "Settle claim rejected",
  payment_verified: "Wallet payment verified",
  payment_rejected: "Wallet payment rejected",
  rider_adjustment: "Rider wallet adjustment",
  rate_change: "Pay rate changed",
  wallet_numbers_changed: "Customer wallet numbers changed",
};

export interface MoneyAuditEntry {
  id: string;
  at: number;
  actorId: string | null;
  actorEmail: string | null;
  event: string;
  subjectType: string;
  subjectId: string | null;
  amount: number | null;
  detail: Record<string, unknown>;
}

export const parseAuditEvent = (raw: string | null | undefined): AuditEvent | null =>
  (AUDIT_EVENTS as readonly string[]).includes(raw ?? "") ? (raw as AuditEvent) : null;

export const parseAuditLimit = (raw: string | null | undefined): number => {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, n));
};

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** A short, human line for the entry's extra detail (never a raw JSON dump). */
export const describeAudit = (e: Pick<MoneyAuditEntry, "event" | "detail" | "subjectId">): string => {
  const d = e.detail ?? {};
  switch (e.event) {
    case "shop_payout":
    case "rider_payout_paid":
      return [str(d.method).toUpperCase(), str(d.reference)].filter(Boolean).join(" · ");
    case "rider_payout_rejected":
    case "settle_claim_rejected":
      return str(d.note);
    case "rider_settle": {
      const net = Number(d.netted ?? 0);
      const ref = str(d.reference);
      return [net > 0 ? `netted ${net} paisa from wallet` : "", ref].filter(Boolean).join(" · ");
    }
    case "payment_verified":
    case "payment_rejected":
      return str(d.payment).toUpperCase();
    case "rider_adjustment":
      return [str(d.kind), str(d.note)].filter(Boolean).join(" · ");
    case "rate_change":
      return `${str(e.subjectId)}: ${str(d.from) || "—"} → ${str(d.to)} (paisa)`;
    case "wallet_numbers_changed":
      return Array.isArray(d.methods) ? `methods: ${(d.methods as unknown[]).map(str).join(", ")}` : "";
    default:
      return "";
  }
};
