"use client";

import { useEffect, useRef, useState } from "react";
import { formatBdt } from "@/lib/format";
import { IconShield } from "@/components/ui/icons";

/**
 * Cash pay-in claim: the rider hands the money over first, then staff approve
 * the claim. bKash/bank need a reference. `onSubmit` returns a refusal text,
 * or null once the claim was sent. (The refusal is shown INSIDE the dialog —
 * it used to land on the page banner, hidden behind the overlay.)
 */
interface SettleModalProps {
  cashInHand: number;
  onSubmit: (method: string, reference: string) => Promise<string | null>;
  onClose: () => void;
  /** Keep the owner mounted while hidden so pending claims stay locked. */
  open?: boolean;
  onSuccess?: () => void;
}

export function SettleModal({ open = true, onSubmit, onClose, onSuccess, ...props }: SettleModalProps) {
  const owner = useRef({ active: false, open, generation: 0, pending: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const state = owner.current;
    state.active = true;
    return () => { state.active = false; state.generation++; };
  }, []);
  useEffect(() => {
    owner.current.open = open;
    owner.current.generation++;
  }, [open]);

  const close = () => {
    owner.current.open = false;
    owner.current.generation++;
    onClose();
  };
  const submit = async (method: string, reference: string): Promise<string | null> => {
    const state = owner.current;
    if (!state.active || !state.open || state.pending) return null;
    const generation = state.generation;
    const current = () => state.active && state.open && state.generation === generation;
    state.pending = true;
    setBusy(true);
    let refusal: string | null;
    try {
      refusal = await onSubmit(method, reference);
    } catch {
      refusal = "দাবি পাঠানো যায়নি — আবার চেষ্টা করুন।";
    } finally {
      // Closing the view does not cancel a financial claim already in flight.
      state.pending = false;
      if (state.active) setBusy(false);
    }
    if (!current()) return null;
    if (refusal === null) onSuccess?.();
    return refusal;
  };

  return open ? <SettlementForm {...props} busy={busy} onSubmit={submit} onClose={close} /> : null;
}

function SettlementForm({ cashInHand, onSubmit, onClose, busy }: Pick<SettleModalProps, "cashInHand" | "onSubmit" | "onClose"> & { busy: boolean }) {
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const [settleMethod, setSettleMethod] = useState("cash");
  const [settleRef, setSettleRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !active.current) return;
    if (settleMethod !== "cash" && settleRef.trim().length < 3) {
      setError("bKash/bank-এর জন্য reference/TRXID দিন।");
      return;
    }
    setError(null);
    const refusal = await onSubmit(settleMethod, settleRef.trim());
    if (active.current && refusal !== null) setError(refusal);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border border-line bg-paper p-6 shadow-xl space-y-4">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 text-forest-800">
            <IconShield className="h-6 w-6" />
          </span>
          <h3 className="font-display mt-3 text-lg font-bold text-forest-900">
            টাকা জমার দাবি
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            {formatBdt(cashInHand)} অফিসে / bKash-এ / bank-এ জমা দিয়ে
            নিচে দাবি পাঠান — Admin approve করলে balance কমবে।
          </p>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-forest-900">
            কীভাবে জমা দিয়েছেন?
            <select
              value={settleMethod}
              onChange={(e) => setSettleMethod(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-ivory-50 px-3 text-sm font-normal"
            >
              <option value="cash">অফিসে নগদ (Cash)</option>
              <option value="bkash">bKash</option>
              <option value="bank">Bank</option>
            </select>
          </label>
          {settleMethod !== "cash" && (
            <label className="block text-xs font-semibold text-forest-900">
              Reference / TRXID *
              <input
                value={settleRef}
                onChange={(e) => setSettleRef(e.target.value)}
                placeholder="যেমন: 9HXK2LM4PQ"
                maxLength={120}
                className="mt-1 h-11 w-full rounded-xl border border-line bg-ivory-50 px-3 text-sm font-normal"
              />
            </label>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-center text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-full border border-line bg-paper text-xs font-semibold text-ink-soft hover:bg-ivory-100"
          >
            বাতিল
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="h-12 flex-1 rounded-full bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            {busy ? "দাবি পাঠানো হচ্ছে…" : "দাবি পাঠান"}
          </button>
        </div>
      </div>
    </div>
  );
}
