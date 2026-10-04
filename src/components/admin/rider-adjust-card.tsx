"use client";

/**
 * Item W — a manual wallet credit/debit for one rider (a goodwill bonus, a
 * damaged-parcel penalty, a fix the system missed). The reason is mandatory:
 * the rider reads it, and the money audit log keeps it with the staff name.
 */

import { useState } from "react";
import { apiErrorMessage, apiSend } from "@/lib/admin-api";

export function RiderAdjustCard({ riderId, onDone }: { riderId: string; onDone?: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = Number(amount);
    const verb = n > 0 ? "CREDIT" : "DEBIT";
    if (!window.confirm(`${verb} ৳${Math.abs(n)} ${n > 0 ? "to" : "from"} this rider's wallet?\n\nReason: ${note}\n\nThe rider is told, and it is recorded under your name.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiSend(`/api/admin/riders/${encodeURIComponent(riderId)}/adjust`, "POST", { amountTaka: amount, note });
      setMsg({ ok: true, text: "Wallet adjusted and the rider has been told." });
      setAmount("");
      setNote("");
      onDone?.();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const valid = Number.isFinite(Number(amount)) && Number(amount) !== 0 && amount.trim() !== "" && note.trim().length >= 5;
  return (
    <section data-testid="adjust-card" aria-label="Wallet adjustment" className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <h2 className="font-display text-lg font-bold text-forest-900">Wallet adjustment</h2>
      <p className="mt-1 text-xs text-ink-soft">Positive adds to what we owe the rider; negative takes it back. Cannot take the wallet below zero.</p>
      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[9rem_1fr_auto] sm:items-end">
        <label className="text-xs font-semibold text-ink-soft">
          Amount (৳)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 50 or -30"
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink-soft">
          Reason (the rider sees this)
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" disabled={busy || !valid} className="rounded-full bg-forest-900 px-5 py-2 text-xs font-semibold text-ivory-50 disabled:opacity-40">
          Apply
        </button>
      </form>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs font-medium ${msg.ok ? "text-emerald-800" : "text-rose-800"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
