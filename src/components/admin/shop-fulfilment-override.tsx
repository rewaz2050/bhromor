"use client";

import { useState } from "react";
import { ACTION_LABEL, nextActions, type Order, type OrderStatus } from "@/lib/orders";
import { isShopFulfilment, isShopFulfilmentTarget, validOverrideReason, OVERRIDE_REASON_MIN, OVERRIDE_REASON_MAX } from "@/lib/shop-fulfilment";
import { useStaffRole } from "@/lib/use-staff-role";

export default function ShopFulfilmentOverride({ order, onOverride }: {
  order: Order;
  onOverride: (to: OrderStatus, reason: string) => Promise<boolean>;
}) {
  const { checked, canManage } = useStaffRole();
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<OrderStatus | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = nextActions(order.status).filter((to) => isShopFulfilment(order, to));
  const target = targets.find((to) => to === selected) ?? targets[0];
  if (!checked || !canManage || !target || order.isReturn) return null;

  return (
    <details className="rounded-2xl bg-paper p-4 ring-1 ring-line">
      <summary className="cursor-pointer text-sm font-semibold text-forest-900">Emergency shop fulfilment override</summary>
      <p className="mt-3 text-sm text-ink-soft">The shop normally confirms and prepares this order. Admin/Super Admin may act only as an exception. Your identity and reason are recorded in its timeline.</p>
      <form className="mt-4 space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !target || !isShopFulfilmentTarget(target) || !validOverrideReason(reason)) return;
        setBusy(true);
        setError(null);
        try {
          if (await onOverride(target, reason.trim())) setReason("");
          else setError("Override failed. Check the order error and refresh before trying again.");
        } catch {
          setError("Override failed. Refresh and check the current order status.");
        } finally { setBusy(false); }
      }}>
        <label className="block text-sm font-medium text-ink">
          Emergency action
          <select value={target} disabled={busy} onChange={(e) => setSelected(e.target.value as OrderStatus)} className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-paper px-3">
            {targets.map((to) => <option key={to} value={to}>{ACTION_LABEL[to as Exclude<OrderStatus, "pending">]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Reason for overriding the shop
          <textarea required minLength={OVERRIDE_REASON_MIN} maxLength={OVERRIDE_REASON_MAX} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} rows={3} aria-describedby="shop-override-reason-help" className="mt-1 block w-full rounded-xl border border-line bg-paper p-3" />
        </label>
        <p id="shop-override-reason-help" className="text-xs text-ink-soft">10–300 characters. Explain why the shop cannot perform this step; do not include PINs or private payment details.</p>
        {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
        <button type="submit" disabled={busy || !validOverrideReason(reason)} className="min-h-11 rounded-full px-5 py-2 text-sm font-semibold text-forest-900 ring-1 ring-forest-800 disabled:opacity-50">
          {busy ? "Recording override…" : "Record emergency override"}
        </button>
      </form>
    </details>
  );
}
