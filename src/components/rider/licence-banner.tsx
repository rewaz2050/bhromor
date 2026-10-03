"use client";

/** Item N — the rider's own heads-up about a lapsing / lapsed driving licence. */

import { useState } from "react";
import { dhakaDateString } from "@/lib/delivery-slots";
import { licenceRiderMessage, licenceStatus } from "@/lib/kyc-expiry";

export function LicenceBanner({ vehicle, expiresOn, nowMs }: { vehicle: string; expiresOn?: string | null; nowMs?: number }) {
  const [today] = useState(() => dhakaDateString(nowMs ?? Date.now()));
  const status = licenceStatus(vehicle, expiresOn, today);
  const message = licenceRiderMessage(status);
  if (!message) return null;
  const expired = status.kind === "expired";
  return (
    <div
      role={expired ? "alert" : "status"}
      data-testid="licence-banner"
      data-kind={status.kind}
      className={`rounded-2xl p-4 text-xs font-semibold ring-1 ${
        expired ? "bg-rose-50 text-rose-900 ring-rose-300" : "bg-amber-50 text-amber-900 ring-amber-300"
      }`}
    >
      {message}
    </div>
  );
}
