"use client";

/**
 * /rider/profile — the rider's account: identity and vehicle, the shift they
 * work, and the record of cash they have handed in. Moved off the home screen
 * so the first thing a rider sees is the next job, not a settings form.
 */

import { useState } from "react";
import { RiderProfile } from "@/components/rider/rider-profile";
import { RiderShiftCard } from "@/components/rider/rider-shift-card";
import { useRiderJobs, useRiderSession } from "@/lib/use-rider";
import { formatBdt } from "@/lib/format";

export default function RiderProfilePage() {
  const session = useRiderSession();
  const rider = session.rider;
  const jobsApi = useRiderJobs(session.status === "authed", rider?.id);
  const [flash, setFlash] = useState<string | null>(null);

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

        {/* Cash handed in */}
        {jobsApi.settlements.length > 0 && (
          <section aria-label="Recent settlements">
            <h2 className="font-display mb-3 text-base font-semibold text-forest-900">
              সাম্প্রতিক টাকা জমা (Settlement ইতিহাস)
            </h2>
            <ul className="space-y-2">
              {jobsApi.settlements.slice(0, 6).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl bg-paper p-3 text-xs ring-1 ring-line"
                >
                  <div>
                    <p className="font-semibold text-forest-900">
                      {formatBdt(s.amount)} · {s.method.toUpperCase()}
                    </p>
                    {s.nettedAmount > 0 && (
                      <p className="mt-0.5 text-forest-800">
                        এর মধ্যে {formatBdt(s.nettedAmount)} আপনার wallet-এর পাওনা থেকে সমন্বয়; নগদ দিয়েছেন {formatBdt(s.amount - s.nettedAmount)}
                      </p>
                    )}
                    <p className="mt-0.5 text-ink-soft">
                      {new Date(s.at).toLocaleString("bn-BD", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {s.reference ? ` · ${s.reference}` : ""}
                    </p>
                  </div>
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
