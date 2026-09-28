"use client";

/**
 * B3 (2026-09-28) — "Your own promo codes", with the money on the screen.
 *
 * The whole reason this card exists in this shape: a discount is not free, and
 * the shop is the one paying. So before the code is saved the card shows what
 * it does to ONE real order — the platform's commission, the shop's share with
 * and without the code, and how much extra volume pays the discount back
 * ("13% more orders and you are even"). The caps on top are the platform's.
 *
 * Presentational + plain props: the page hands over the hook's data, so the
 * arithmetic and the state machine can be tested without a network.
 */

import { useState } from "react";
import { formatBdt } from "@/lib/format";
import { formatDateTime } from "@/components/vendor/vendor-ui";
import {
  PROMO_STATE_LABEL,
  SAMPLE_ORDER_PAISA,
  promoRemaining,
  promoShareMath,
  promoShareSummary,
  promoState,
  promoCapsLines,
  validateVendorPromo,
  type PromoLimits,
} from "@/lib/vendor-promo";
import type { VendorPromoRow } from "@/lib/use-vendor";

const stateTone: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800",
  scheduled: "bg-sky-100 text-sky-800",
  paused: "bg-ivory-200 text-ink-soft",
  "used-up": "bg-amber-100 text-amber-900",
  expired: "bg-ivory-200 text-ink-soft",
};

interface Draft {
  code: string;
  type: "percent" | "fixed";
  value: string;
  minOrder: string;
  maxDiscount: string;
  days: string;
  usageLimit: string;
  description: string;
}

const emptyDraft = (limits: PromoLimits): Draft => ({
  code: "",
  type: "percent",
  value: "10",
  minOrder: "",
  maxDiscount: "",
  days: "14",
  usageLimit: String(Math.min(50, limits.maxUsage)),
  description: "",
});

export default function PromoCard({
  promos,
  limits,
  usedTotal,
  discountBornePaisa,
  commissionPct,
  loading = false,
  onCreate,
  onToggle,
}: {
  promos: VendorPromoRow[];
  limits: PromoLimits;
  usedTotal: number;
  /** Paisa the shop's own codes have taken off its share so far (ledger). */
  discountBornePaisa: number;
  /** The shop's real commission rate — the same number the ledger uses. */
  commissionPct: number;
  loading?: boolean;
  onCreate: (draft: Record<string, unknown>) => Promise<VendorPromoRow>;
  onToggle: (id: string, active: boolean) => Promise<VendorPromoRow>;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(limits));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checked = validateVendorPromo(draft, limits);
  // The preview uses the values as typed (a bad field simply shows a smaller
  // or zero discount) — the shop sees the money, not an error, while typing.
  const preview = promoShareMath(
    {
      type: draft.type,
      value: draft.type === "fixed" ? Math.round((Number(draft.value) || 0) * 100) : Number(draft.value) || 0,
      maxDiscount: draft.maxDiscount ? Math.round((Number(draft.maxDiscount) || 0) * 100) : null,
    },
    { commissionPct },
  );

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (error) setError(null);
    if (notice) setNotice(null);
  };

  const submit = async () => {
    if (!checked.ok) {
      setError(Object.values(checked.errors)[0] ?? "Please check the code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await onCreate({ ...draft });
      setNotice(`${saved.code} is saved and live — shoppers can use it now.`);
      setDraft(emptyDraft(limits));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the code — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Your promo codes"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="promo-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Your own promo codes
        </h3>
        <p className="text-[0.68rem] text-ink-soft">
          The discount comes out of your share — the platform&apos;s {commissionPct}% commission
          is unchanged.
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-ink-soft">…</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="promo-totals">
            <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
              <p className="text-[0.68rem] text-ink-soft">Codes</p>
              <p className="font-display text-xl text-forest-900">{promos.length}</p>
            </div>
            <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
              <p className="text-[0.68rem] text-ink-soft">Times used</p>
              <p className="font-display text-xl text-forest-900">{usedTotal}</p>
            </div>
            <div className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
              <p className="text-[0.68rem] text-ink-soft">Discount given (your share)</p>
              <p className="font-display text-xl text-forest-900">
                {formatBdt(discountBornePaisa)}
              </p>
            </div>
          </div>

          {/* What the platform allows — printed, so "no" never feels random. */}
          <ul className="mt-3 flex flex-wrap gap-2 text-[0.68rem] text-ink-soft" data-testid="promo-caps">
            {promoCapsLines(limits).map((line) => (
              <li key={line} className="rounded-full bg-ivory-100 px-3 py-1 ring-1 ring-line">
                {line}
              </li>
            ))}
          </ul>

          {/* The money, before saving. */}
          <div className="mt-4 rounded-xl bg-forest-50 p-4 ring-1 ring-forest-100" data-testid="promo-preview">
            <p className="text-xs font-semibold text-forest-900">
              On a {formatBdt(SAMPLE_ORDER_PAISA)} order
            </p>
            <p className="mt-1 text-sm leading-6 text-ink">{promoShareSummary(preview)}</p>
            <div className="mt-2 grid gap-1 text-[0.68rem] text-ink-soft sm:grid-cols-3">
              <span>Shopper saves {formatBdt(preview.discount)}</span>
              <span>Your share {formatBdt(preview.vendorWith)} (was {formatBdt(preview.vendorWithout)})</span>
              <span>Platform commission {formatBdt(preview.commission)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-soft">
              Code
              <input
                value={draft.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                placeholder="EID10"
                data-testid="promo-code"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm uppercase tracking-wide ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="text-xs font-medium text-ink-soft">
              Kind
              <select
                value={draft.type}
                onChange={(e) => set({ type: e.target.value === "fixed" ? "fixed" : "percent" })}
                data-testid="promo-type"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              >
                <option value="percent">Percent off</option>
                <option value="fixed">Taka off</option>
              </select>
            </label>
            <label className="text-xs font-medium text-ink-soft">
              {draft.type === "percent" ? "Percent off" : "Taka off"}
              <input
                type="number"
                min={1}
                value={draft.value}
                onChange={(e) => set({ value: e.target.value })}
                data-testid="promo-value"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="text-xs font-medium text-ink-soft">
              Minimum order (৳, blank = none)
              <input
                type="number"
                min={0}
                value={draft.minOrder}
                onChange={(e) => set({ minOrder: e.target.value })}
                data-testid="promo-min"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            {draft.type === "percent" && (
              <label className="text-xs font-medium text-ink-soft">
                Most off per order (৳, blank = none)
                <input
                  type="number"
                  min={0}
                  value={draft.maxDiscount}
                  onChange={(e) => set({ maxDiscount: e.target.value })}
                  data-testid="promo-cap"
                  className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
                />
              </label>
            )}
            <label className="text-xs font-medium text-ink-soft">
              Runs for (days)
              <input
                type="number"
                min={1}
                value={draft.days}
                onChange={(e) => set({ days: e.target.value })}
                data-testid="promo-days"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="text-xs font-medium text-ink-soft">
              Most redemptions
              <input
                type="number"
                min={1}
                value={draft.usageLimit}
                onChange={(e) => set({ usageLimit: e.target.value })}
                data-testid="promo-usage"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
            <label className="text-xs font-medium text-ink-soft sm:col-span-2">
              Note for yourself (not shown to shoppers)
              <input
                value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Eid week, sarees only"
                data-testid="promo-note"
                className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !checked.ok}
              data-testid="promo-save"
              className="rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Create code"}
            </button>
            {!checked.ok && (
              <span className="text-xs text-ink-soft" data-testid="promo-hint">
                {Object.values(checked.errors)[0]}
              </span>
            )}
            {notice && (
              <span role="status" className="text-xs font-medium text-forest-800">
                {notice}
              </span>
            )}
            {error && (
              <span role="alert" className="text-xs font-medium text-red-700">
                {error}
              </span>
            )}
          </div>

          {promos.length > 0 && (
            <ul className="mt-5 space-y-2" data-testid="promo-list">
              {promos.map((promo) => {
                const state = promoState(promo);
                const remaining = promoRemaining(promo);
                return (
                  <li
                    key={promo.id}
                    data-testid={`promo-row-${promo.code}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ivory-50 p-3 ring-1 ring-line"
                  >
                    <span className="font-mono text-sm font-semibold tracking-wide text-forest-900">
                      {promo.code}
                    </span>
                    <span className="text-xs text-ink">
                      {promo.type === "percent"
                        ? `${promo.value}% off${promo.maxDiscount ? ` up to ${formatBdt(promo.maxDiscount)}` : ""}`
                        : `${formatBdt(promo.value)} off`}
                    </span>
                    {promo.minOrder > 0 && (
                      <span className="text-[0.68rem] text-ink-soft">
                        from {formatBdt(promo.minOrder)}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${
                        stateTone[state] ?? "bg-ivory-200 text-ink-soft"
                      }`}
                    >
                      {PROMO_STATE_LABEL[state]}
                    </span>
                    <span className="text-[0.68rem] text-ink-soft">
                      {promo.used} used
                      {remaining === null ? "" : ` · ${remaining} left`}
                      {promo.validUntil ? ` · until ${formatDateTime(promo.validUntil)}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => void onToggle(promo.id, !promo.active)}
                      className="ml-auto text-xs font-semibold text-forest-800 underline underline-offset-2"
                    >
                      {promo.active ? "Pause" : "Resume"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
