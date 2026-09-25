"use client";

/**
 * "Rider offer যাচ্ছে না কেন?" — the card that answers it (2026-09-25).
 *
 * The dispatch board used to list a ready order as merely *awaiting*, and
 * every cause looked the same: nobody online, wrong zone, off-shift, cash cap,
 * every rider already carrying one, or every rider in the zone having already
 * seen this order (a lapsed offer is never re-shown to the same rider). The
 * owner's report — "shop Ready চাপে, rider কিছুই পায় না, কিছু মিলছে না" — is
 * that list, invisible.
 *
 * Each row here prints the reason `ps_dispatch_diagnosis` found, with the
 * rider counts behind it, and the one action that unblocks it:
 *   • an eligible rider exists → **Assign now** (auto-offer + the rider's
 *     phone buzzes);
 *   • every rider already saw it → pick one by hand, because
 *     `ps_assign_batch_to_rider` is the staff override that ignores the
 *     seen-check.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiErrorMessage, apiGet, apiSend } from "@/lib/admin-api";
import { usePoll } from "@/lib/use-poll";
import { useRiders } from "@/lib/use-riders";
import type { Rider } from "@/lib/catalog";
import type { StrandedOrder } from "@/lib/db/riders";

const REASON_LABEL: Record<string, string> = {
  "order-not-ready": "এখনো dispatch-ready না",
  "no-active-rider": "কোনো active rider নেই",
  "no-one-online": "কেউ Online নেই",
  "off-shift": "রাইডার shift-এর বাইরে",
  "zone-mismatch": "এই zone-এ রাইডার নেই",
  "cash-cap": "রাইডারের ক্যাশ সীমা শেষ",
  "all-busy": "সব রাইডারের হাতে অর্ডার",
  "all-have-seen": "সব রাইডার অফারটা দেখে ফেলেছে",
  "already-offered": "একটা live অফার আছে",
  eligible: "রাইডার পাওয়া যাবে",
};

const BUCKET_ROWS: { key: keyof StrandedOrder["diagnosis"]; label: string }[] = [
  { key: "riders_active", label: "Active" },
  { key: "riders_online", label: "Online" },
  { key: "riders_on_shift", label: "Shift-এ" },
  { key: "riders_in_zone", label: "এই zone-এ" },
  { key: "riders_under_cash_cap", label: "ক্যাশ সীমার নিচে" },
  { key: "riders_free", label: "খালি হাতে" },
  { key: "riders_not_seen", label: "এই অর্ডার দেখেনি" },
];

export function AdminStrandedOrders({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<StrandedOrder[]>([]);
  const [available, setAvailable] = useState(true);
  const [migration, setMigration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { riders, live } = useRiders();

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{
        stranded: StrandedOrder[];
        available: boolean;
        migration?: string;
      }>("/api/admin/deliveries/stranded");
      setRows(data.stranded ?? []);
      setAvailable(data.available !== false);
      setMigration(data.migration ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial probe
    void refresh();
  }, [live, refresh]);

  usePoll(refresh, 30_000, live);

  const onlineRiders = useMemo(
    () => riders.filter((r) => r.isOnline && r.status === "active"),
    [riders],
  );

  const assign = async (orderNo: string, riderId?: string) => {
    setBusyOrder(orderNo);
    setNote(null);
    setError(null);
    try {
      if (riderId) {
        // The staff override: bypasses the "already saw it" rule.
        const data = await apiSend<{ assigned: number }>(
          "/api/admin/deliveries/batch",
          "POST",
          { riderId, orderIds: [orderNo] },
        );
        setNote(
          data.assigned > 0
            ? `${orderNo} → রাইডারকে অফার গেছে (ফোনে notification যাবে)।`
            : `${orderNo} assign করা যায়নি — রাইডার হয়তো offline।`,
        );
      } else {
        await apiSend("/api/admin/deliveries/offer", "POST", { orderId: orderNo });
        setNote(`${orderNo} → পরের eligible রাইডারকে অফার গেছে।`);
      }
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyOrder(null);
    }
  };

  if (!available) {
    return (
      <section
        aria-label="Stranded orders"
        className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900"
      >
        <p className="font-semibold">Stranded-orders diagnosis চালু নেই</p>
        <p className="mt-1">
          SQL Editor-এ{" "}
          <code className="rounded bg-amber-100 px-1">
            {migration ?? "supabase/migrations/202609250001_rider_dispatch_fix.sql"}
          </code>{" "}
          চালান — তারপর এই কার্ড বলে দেবে কোন অর্ডার কেন রাইডার পাচ্ছে না।
        </p>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section
        aria-label="Stranded orders"
        className="rounded-2xl border border-line bg-paper p-4 text-xs text-ink-soft"
      >
        কোনো অর্ডার রাইডার ছাড়া আটকে নেই। {error ? `(${error})` : ""}
      </section>
    );
  }

  return (
    <section
      aria-label="Stranded orders"
      className="space-y-3 rounded-2xl border border-rose-300 bg-rose-50/60 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-rose-900">
          ⚠️ {rows.length} টা অর্ডার রাইডার পাচ্ছে না
        </h2>
        <p className="text-[11px] text-rose-800/80">প্রতিটার আসল কারণ নিচে লেখা</p>
      </div>

      {note && <p className="text-[11px] font-semibold text-emerald-800">{note}</p>}
      {error && <p className="text-[11px] font-semibold text-rose-800">{error}</p>}

      <ul className="space-y-2">
        {rows.map((row) => {
          const reason = row.diagnosis?.reason ?? "unknown";
          const counts = BUCKET_ROWS.map((b) => ({
            label: b.label,
            value: row.diagnosis?.[b.key],
          })).filter((c) => typeof c.value === "number");
          return (
            <li
              key={row.order_no}
              className="rounded-xl border border-rose-200 bg-ivory-50 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs font-bold text-forest-900">
                  {row.order_no}
                </p>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-900">
                  {REASON_LABEL[reason] ?? reason}
                </span>
              </div>

              <p className="mt-1 text-[11px] text-ink">
                {row.diagnosis?.answer ?? ""}
              </p>

              {counts.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-ink-soft">
                  {counts.map((c) => (
                    <span key={c.label}>
                      {c.label}: <strong>{c.value}</strong>
                    </span>
                  ))}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {reason === "eligible" || reason === "all-busy" ? (
                  <button
                    type="button"
                    disabled={busyOrder === row.order_no}
                    onClick={() => void assign(row.order_no)}
                    className="rounded-full bg-forest-800 px-3 py-1.5 text-[11px] font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-60"
                  >
                    {busyOrder === row.order_no ? "…" : "Assign now"}
                  </button>
                ) : null}

                {(reason === "all-have-seen" || reason === "all-busy") && (
                  <select
                    aria-label={`রাইডার বাছাই — ${row.order_no}`}
                    defaultValue=""
                    disabled={busyOrder === row.order_no || onlineRiders.length === 0}
                    onChange={(event) => {
                      const riderId = event.target.value;
                      if (riderId) void assign(row.order_no, riderId);
                      event.target.value = "";
                    }}
                    className="rounded-full border border-line bg-ivory-50 px-3 py-1.5 text-[11px] text-ink"
                  >
                    <option value="" disabled>
                      {onlineRiders.length === 0
                        ? "কোনো online রাইডার নেই"
                        : "নিজে রাইডার বাছাই করুন…"}
                    </option>
                    {onlineRiders.map((r: Rider) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}

                {(reason === "no-one-online" || reason === "off-shift") && (
                  <p className="text-[10px] text-ink-soft">
                    রাইডারকে /rider-এ Online toggle অন করতে বলুন — তারপর এই কার্ড
                    ৩০ সেকেন্ডে নিজেই হালনাগাদ হবে।
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
