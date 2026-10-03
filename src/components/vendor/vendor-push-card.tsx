"use client";

/**
 * "Orders ring even when this panel is closed" — the shop's one-tap switch for background
 * new-order alerts (migration 202610020018). One quiet line when on; a visible card when off,
 * because the in-page bell only works while the dashboard is open.
 */

import { useVendorPush } from "@/lib/use-vendor-push";

export function VendorPushCard({ enabled }: { enabled: boolean }) {
  const push = useVendorPush(enabled);

  if (push.phase === "loading" || push.phase === "off-server") return null;

  if (push.phase === "on") {
    return (
      <div
        data-testid="vendor-push-on"
        className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200"
      >
        <span className="font-semibold">🔔 New orders buzz this phone even when the panel is closed.</span>
        <button
          type="button"
          onClick={() => void push.disable()}
          disabled={push.busy}
          className="shrink-0 text-emerald-800 underline underline-offset-2 disabled:opacity-50"
        >
          Turn off
        </button>
      </div>
    );
  }

  return (
    <section data-testid="vendor-push-card" className="mt-3 space-y-2 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <p className="text-sm font-bold text-forest-950">🔔 Don’t miss an order</p>
      <p className="text-xs text-ink-soft">
        Turn on notifications and this phone buzzes for every new order — even with the panel closed or the phone in
        your pocket. (You also get a reminder here when you owe PROSANTI money.)
      </p>
      {push.phase === "blocked" && (
        <p role="note" className="text-xs font-semibold text-rose-800">
          {push.blocker}
        </p>
      )}
      {push.phase === "denied" && (
        <div role="note" className="space-y-1 text-xs text-rose-800">
          <p className="font-semibold">Notifications are blocked. To turn them on:</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            {push.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {push.error && (
        <p role="alert" className="text-xs font-semibold text-rose-800">
          {push.error}
        </p>
      )}
      {push.phase === "off" && (
        <button
          type="button"
          onClick={() => void push.enable()}
          disabled={push.busy}
          className="rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 disabled:opacity-50"
        >
          {push.busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
    </section>
  );
}
