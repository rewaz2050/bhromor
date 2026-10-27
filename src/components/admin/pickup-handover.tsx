"use client";

import { useState } from "react";

import { PICKUP_LOCATION_LINE } from "@/lib/pickup-location";

/**
 * The approved pickup counter is Traffic Point (src/lib/pickup-location.ts) —
 * never the shop's own address. The expected code is never loaded.
 */
export default function PickupHandover({ verify }: { verify: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3 rounded-xl border border-line p-4" onSubmit={async event => {
      event.preventDefault();
      if (busy || !/^[0-9]{4}$/.test(code)) return;
      setBusy(true);
      try { if (await verify(code)) setCode(""); } finally { setBusy(false); }
    }}>
      <p className="text-sm text-ink-soft">
        {PICKUP_LOCATION_LINE} — ask the customer for their PIN. / কাস্টমারের PIN নিয়ে যাচাই করে পার্সেল দিন।
      </p>
      <label className="block text-sm font-medium" htmlFor="pickup-pin">Customer PIN / কাস্টমারের PIN</label>
      <input id="pickup-pin" type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{4}" maxLength={4}
        value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ""))}
        disabled={busy} className="min-h-11 w-36 rounded-lg border border-line bg-paper px-3 font-mono tracking-widest" />
      <button type="submit" disabled={busy || !/^[0-9]{4}$/.test(code)} className="ml-3 min-h-11 rounded-lg bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-50">
        {busy ? "Verifying… / যাচাই হচ্ছে…" : "Verify PIN & hand over"}
      </button>
      <p className="text-xs text-ink-soft">The server checks the PIN; the stored code is never shown to staff. / সংরক্ষিত PIN staff-কে দেখানো হয় না।</p>
    </form>
  );
}
