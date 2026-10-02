"use client";

/**
 * /rider/profile — the rider's account: identity and vehicle, the shift they
 * work, and the record of cash they have handed in. Moved off the home screen
 * so the first thing a rider sees is the next job, not a settings form.
 */

import { useMemo, useState } from "react";
import { RiderProfile } from "@/components/rider/rider-profile";
import { RiderShiftCard } from "@/components/rider/rider-shift-card";
import { useRiderJobs, useRiderSession } from "@/lib/use-rider";
import { formatBdt } from "@/lib/format";
import { buildCashTimeline, CASH_TIMELINE_LABEL, cashTimelineHint } from "@/lib/rider-cash-timeline";

export default function RiderProfilePage() {
  const session = useRiderSession();
  const rider = session.rider;
  const jobsApi = useRiderJobs(session.status === "authed", rider?.id);
  const [flash, setFlash] = useState<string | null>(null);

  const timeline = useMemo(
    () => buildCashTimeline(jobsApi.settlements, jobsApi.recentClaims ?? []),
    [jobsApi.settlements, jobsApi.recentClaims],
  );

  if (!rider) return null;

  return (
    <div className="flex-1 pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-forest-900 px-5 py-4 text-ivory-50">
        <h1 className="font-display text-base font-semibold">আমার প্রোফাইল</h1>
        <p className="text-[11px] text-ivory-100/70">{rider.name} · {session.email}</p>
      </header>

      <div className="space-y-5 p-4">
        {flash && (
          <div role="status" className="rounded-2xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-300">
            {flash}
          </div>
        )}

        <RiderProfile key={rider.id} rider={rider} onSaved={session.refresh} />

        <RiderShiftCard rider={rider} onSave={session.setAvailability} flash={setFlash} />

        {/* Cash pay-in timeline: pending → settled, or rejected with the reason */}
        {timeline.length > 0 && (
          <section aria-label="Recent settlements">
            <h2 className="font-display mb-3 text-base font-semibold text-forest-900">
              টাকা জমার টাইমলাইন
            </h2>
            <ul className="space-y-2">
              {timeline.map((item) => (
                <li
                  key={item.id}
                  data-kind={item.kind}
                  className={`rounded-xl p-3 text-xs ring-1 ${
                    item.kind === "rejected"
                      ? "bg-rose-50 ring-rose-200"
                      : item.kind === "pending"
                        ? "bg-amber-50 ring-amber-200"
                        : "bg-paper ring-line"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-forest-900">
                      {formatBdt(item.amount)} · {item.method.toUpperCase()}
                    </p>
                    <span className="text-[11px] font-semibold text-ink-soft">{CASH_TIMELINE_LABEL[item.kind]}</span>
                  </div>
                  {item.nettedAmount > 0 && (
                    <p className="mt-0.5 text-forest-800">
                      এর মধ্যে {formatBdt(item.nettedAmount)} আপনার wallet-এর পাওনা থেকে সমন্বয়; নগদ দিয়েছেন {formatBdt(item.amount - item.nettedAmount)}
                    </p>
                  )}
                  {cashTimelineHint(item) && <p className="mt-0.5 text-ink">{cashTimelineHint(item)}</p>}
                  <p className="mt-0.5 text-ink-soft">
                    {new Date(item.at).toLocaleString("bn-BD", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {item.reference ? ` · ${item.reference}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={() => void session.signOut()}
          className="w-full rounded-full border border-line bg-paper py-3 text-xs font-semibold text-ink-soft hover:bg-ivory-100"
        >
          সাইন আউট
        </button>
      </div>
    </div>
  );
}
