"use client";

/**
 * "অফারের নোটিফিকেশন" — the rider's one-tap switch for background offer alerts
 * (item I). Quiet when everything is fine (one line), loud when it is off,
 * because an offer lasts ~90 seconds and a closed app cannot ring.
 */

import { useRiderPush } from "@/lib/use-rider-push";

export function RiderPushCard({ enabled }: { enabled: boolean }) {
  const push = useRiderPush(enabled);

  // Nothing useful to show while probing, or when the office has not set it up.
  if (push.phase === "loading" || push.phase === "off-server") return null;

  if (push.phase === "on") {
    return (
      <div data-testid="rider-push-on" className="flex items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
        <span className="font-semibold">🔔 নতুন অফারে অ্যাপ বন্ধ থাকলেও ফোন বাজবে</span>
        <button
          type="button"
          onClick={() => void push.disable()}
          disabled={push.busy}
          className="shrink-0 text-emerald-800 underline underline-offset-2 disabled:opacity-50"
        >
          বন্ধ করুন
        </button>
      </div>
    );
  }

  return (
    <section data-testid="rider-push-card" className="space-y-2 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <p className="text-sm font-bold text-forest-950">🔔 অফার মিস করবেন না</p>
      <p className="text-xs text-ink-soft">
        অফার মাত্র ৯০ সেকেন্ড থাকে। নোটিফিকেশন চালু থাকলে অ্যাপ বন্ধ বা ফোন পকেটে থাকলেও নতুন অফারে ফোন বাজবে।
      </p>
      {push.phase === "blocked" && (
        <p role="note" className="text-xs font-semibold text-rose-800">
          {push.blocker}
        </p>
      )}
      {push.phase === "denied" && (
        <div role="note" className="space-y-1 text-xs text-rose-800">
          <p className="font-semibold">নোটিফিকেশন ব্লক করা আছে। চালু করতে:</p>
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
          {push.busy ? "চালু হচ্ছে…" : "নোটিফিকেশন চালু করুন"}
        </button>
      )}
    </section>
  );
}
