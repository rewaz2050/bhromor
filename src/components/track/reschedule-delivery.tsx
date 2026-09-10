"use client";

import { useState } from "react";

const WINDOWS = ["9-11", "11-1", "2-4", "4-6", "6-8", "8-10", "express"];

export function RescheduleDelivery({ orderId }: { orderId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [window, setWindow] = useState("4-6");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: `${date}T${window.split("-")[0].padStart(2, "0")}:00:00`, delivery_window: window }),
      });
      const data = await res.json().catch(() => null) as any;
      if (!res.ok) {
        // Fallback to public endpoint
        const res2 = await fetch("/api/track/reschedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, scheduled_at: `${date}T${window.split("-")[0].padStart(2, "0")}:00:00`, delivery_window: window }),
        });
        const d2 = await res2.json().catch(() => null) as any;
        if (!res2.ok) throw new Error(d2?.error || data?.error || "Failed");
        setMsg(`✅ Rescheduled to ${date} ${window} — free`);
        return;
      }
      setMsg(`✅ Rescheduled to ${date} ${window} — free`);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Failed"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line space-y-3">
      <h4 className="text-sm font-semibold">📅 Reschedule Delivery — free, Sunamganj Sadar</h4>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0,10)} max={new Date(Date.now()+3*86400000).toISOString().slice(0,10)} className="rounded-xl bg-ivory-50 px-3 py-2 text-sm ring-1 ring-line" />
        <select value={window} onChange={(e) => setWindow(e.target.value)} className="rounded-xl bg-ivory-50 px-3 py-2 text-sm ring-1 ring-line">
          {WINDOWS.map((w) => (
            <option key={w} value={w}>{w === "express" ? "Express 30min +৳40" : w}</option>
          ))}
        </select>
      </div>
      <button type="button" disabled={loading} onClick={submit} className="rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
        {loading ? "Rescheduling..." : "Reschedule Free"}
      </button>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
