"use client";

import { useState } from "react";
import type { Rider } from "@/lib/catalog";
import type { Order } from "@/lib/orders";
import { formatBdt } from "@/lib/format";

export function AdminBatchAssign({
  riders,
  orders,
  onAssigned,
}: {
  riders: Rider[];
  orders: Order[];
  onAssigned?: () => void;
}) {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Mirrors area dispatch (202609250001): manual offers are only for Ready
  // orders. Never offer to take an already accepted trip from its rider.
  // Counter pickups never ride (the customer collects at Traffic Point).
  const pendingOrders = orders.filter(
    (o) =>
      o.status === "ready-for-pickup" &&
      !o.isPickup,
  );
  const onlineRiders = riders.filter((r) => r.isOnline && r.status === "active");

  const toggleOrder = (id: string) => {
    setSelectedOrders((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAssign = async () => {
    if (!selectedRider || selectedOrders.length === 0) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/deliveries/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId: selectedRider, orderIds: selectedOrders }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        assigned?: number;
      } | null;
      if (!res.ok) throw new Error(data?.error || "Batch assign failed");
      const assigned = data?.assigned ?? 0;
      const skipped = selectedOrders.length - assigned;
      setMsg(
        assigned === 0
          ? "⚠️ Nothing assigned — the selected orders are no longer dispatchable (already picked up or moved on)"
          : `✅ Offered ${assigned} order${assigned === 1 ? "" : "s"} to rider${skipped > 0 ? ` · ${skipped} skipped (not dispatchable)` : ""} — rider has 90s to accept`,
      );
      setSelectedOrders([]);
      onAssigned?.();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error && e.message ? e.message : "Failed"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider">📦 Batch Assign — Multi-order route (Sunamganj Sadar)</h3>
      <p className="text-xs text-ink-soft">
        Choose ready orders and an online rider for an exclusive request. Other pending invitations are withdrawn. Already accepted trips are left alone; a rider can accept at most two active orders.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold mb-2">Orders ({pendingOrders.length} dispatchable)</p>
          <div className="max-h-64 overflow-auto space-y-1 rounded-xl bg-ivory-50 p-2 ring-1 ring-line">
            {pendingOrders.slice(0, 30).map((o) => (
              <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedOrders.includes(o.id)}
                  onChange={() => toggleOrder(o.id)}
                  className="h-4 w-4"
                />
                <span className="font-mono text-[11px]">{o.id}</span>
                <span className="text-xs">{o.customer.area} · {formatBdt(o.total)}</span>
                {o.isReturn && <span className="text-[10px] font-bold text-amber-800">↩ return</span>}
                {o.lat && o.lng && <span className="text-[10px] text-sky-700">📍</span>}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">Selected: {selectedOrders.length}</p>
        </div>

        <div>
          <p className="text-xs font-semibold mb-2">Online Riders ({onlineRiders.length})</p>
          <div className="space-y-1">
            {onlineRiders.map((r) => (
              <label key={r.id} className="flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ring-line cursor-pointer hover:bg-ivory-50">
                <input
                  type="radio"
                  name="batchRider"
                  checked={selectedRider === r.id}
                  onChange={() => setSelectedRider(r.id)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-xs text-ink-soft">{r.vehicle} · {r.currentLoad ?? 0} load · {r.ratingAvg}★</span>
                {r.lat && r.lng && <span className="text-[10px] text-emerald-700">📍 live</span>}
              </label>
            ))}
            {onlineRiders.length === 0 && <p className="text-xs text-ink-soft">No online riders — ask riders to go online in rider app.</p>}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={loading || !selectedRider || selectedOrders.length === 0}
        onClick={handleAssign}
        className="rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Assigning..." : `Assign ${selectedOrders.length} orders to rider`}
      </button>
      {msg && <p className="text-xs font-medium">{msg}</p>}
    </div>
  );
}
