"use client";

/**
 * "খবর ফোনে নিন" — the shopper's one-tap order notifications (2026-09-24).
 *
 * Shown twice, deliberately: on the receipt the moment an order is placed
 * (the one moment a shopper is certainly looking) and on the tracker of a
 * live order. Before this card the only way a shopper learned their parcel
 * had moved was to re-open `/track` — or wait for the shop to call.
 *
 * The card never oversells:
 *   • it lists every step it will announce, from the same `CUSTOMER_JOURNEY`
 *     the fan-out walks (one message per real transition, skip a step and
 *     nothing is sent);
 *   • an in-app browser (WhatsApp/Facebook WebView) is told plainly that push
 *     cannot work there, with the Chrome instruction — the single most common
 *     way a Sunamganj shopper would otherwise tap a dead button;
 *   • a sticky "denied" shows the hand-set steps instead of a retry loop;
 *   • nothing is claimed until the server has stored the endpoint, and a
 *     finished/cancelled order does not offer the card at all.
 */

import { useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconBell, IconCheck } from "@/components/ui/icons";
import { customerPushPromise } from "@/lib/notify-messages";
import { useOrderPush } from "@/lib/use-order-push";

/**
 * Only live orders can still produce a step. `status` is optional so the
 * receipt (which knows the order is brand new) can render the card without
 * carrying the whole order shape.
 */
const isLive = (status?: string): boolean =>
  status !== "delivered" && status !== "cancelled";

export default function NotifyOptIn({
  orderId,
  phone,
  status,
}: {
  orderId: string;
  /** The checkout phone — the tracker's own proof, and what the row binds to. */
  phone: string;
  /** Order status, when the caller knows it (the tracker does). */
  status?: string;
}) {
  const { t, lang } = useLanguage();
  const { state, enable, disable, sendTest } = useOrderPush(orderId, phone);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLive(status)) return null;

  const journey = customerPushPromise(lang);

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await enable();
    if (result.ok) setNote(t("trackPush.on"));
    else setError(result.message ?? t("trackPush.failed"));
    setBusy(false);
  };

  const onTest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const result = await sendTest();
    if (result.ok) setNote(t("trackPush.testSent"));
    else setError(result.message ?? t("trackPush.failed"));
    setBusy(false);
  };

  const onDisable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    await disable();
    setNote(t("trackPush.off"));
    setBusy(false);
  };

  return (
    <section
      data-testid="track-notify"
      data-state={state.subscribed ? "on" : "off"}
      className="mt-6 rounded-2xl bg-paper p-5 ring-1 ring-line"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
            <IconBell className="h-4 w-4 text-gold-600" />
            {t("trackPush.title")}
          </p>
          <p className="mt-1 text-xs leading-6 text-ink-soft">{t("trackPush.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.subscribed ? (
            <>
              <button
                type="button"
                onClick={() => void onTest()}
                disabled={busy || !state.configured}
                data-testid="track-notify-test"
                className="min-h-11 rounded-full bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-40"
              >
                {t("trackPush.test")}
              </button>
              <button
                type="button"
                onClick={() => void onDisable()}
                disabled={busy}
                data-testid="track-notify-off"
                className="min-h-11 rounded-full px-4 text-sm font-medium text-ink-soft ring-1 ring-line disabled:opacity-40"
              >
                {t("trackPush.disable")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void onEnable()}
              disabled={busy || !state.supported || !state.configured || !state.ready}
              data-testid="track-notify-enable"
              className="min-h-11 rounded-full bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-40"
            >
              {busy ? t("trackPush.working") : t("trackPush.enable")}
            </button>
          )}
        </div>
      </div>

      {/* Every step, from the same journey the fan-out walks. */}
      <ul className="mt-3 flex flex-wrap gap-2" data-testid="track-notify-milestones">
        {journey.map((m) => (
          <li
            key={m.kind}
            className="rounded-full bg-ivory-100 px-3 py-1 text-[0.7rem] font-medium text-ink-soft"
          >
            {m.label}
          </li>
        ))}
      </ul>

      {state.blocker && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-200" data-testid="track-notify-blocker">
          {state.blocker}
        </p>
      )}

      {state.permission === "denied" && state.steps.length > 0 && (
        <div
          className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-200"
          data-testid="track-notify-recovery"
        >
          <p className="font-semibold">{t("trackPush.brBlocked")}</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            {state.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {!state.loading && !state.ready && (
        <p className="mt-3 text-xs leading-5 text-ink-soft" data-testid="track-notify-notready">
          {t("trackPush.notReady")}
        </p>
      )}

      {note && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-forest-800" data-testid="track-notify-note">
          <IconCheck className="h-4 w-4" />
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-800" data-testid="track-notify-error">
          {error}
        </p>
      )}
    </section>
  );
}
