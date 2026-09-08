"use client";

import { useEffect, useRef, useState } from "react";
import { useZones } from "@/lib/use-zones";
import { bdt } from "@/lib/format";
import { nextZoneId } from "@/lib/zone-store";
import { field, hint, label } from "@/components/admin/form-ui";
import {
  IconCheck,
  IconChevron,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";
import type { DeliveryZone } from "@/lib/catalog";

function ZoneRow({
  zone,
  first,
  last,
  onSave,
  onMove,
  onDelete,
}: {
  zone: DeliveryZone;
  first: boolean;
  last: boolean;
  onSave: (z: DeliveryZone) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(zone.name);
  const [chargeTaka, setChargeTaka] = useState(String(zone.charge / 100));
  const [eta, setEta] = useState(zone.etaLabel);
  const [areasText, setAreasText] = useState(zone.areas.join("\n"));
  const [active, setActive] = useState(zone.active !== false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  const save = () => {
    const taka = Number(chargeTaka);
    if (!Number.isFinite(taka) || taka < 0) {
      setError("Enter a valid delivery charge.");
      return;
    }
    const areas = areasText
      .split(/\n|,/g)
      .map((a) => a.trim())
      .filter(Boolean);
    if (areas.length === 0) {
      setError("List at least one covered area.");
      return;
    }
    onSave({
      ...zone,
      name: name.trim() || zone.name,
      charge: bdt(taka),
      etaLabel: eta.trim() || "45–50 min",
      areas,
      active,
    });
    setError(null);
    setSaved(true);
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-base font-medium text-forest-900">
              {name || zone.name}
            </span>
            <span className="rounded-full bg-forest-100 px-2.5 py-1 text-[0.7rem] font-bold text-forest-800">
              ৳{chargeTaka} delivery
            </span>
            {!active && (
              <span className="rounded-full bg-ivory-200 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-ink-soft">{zone.id}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label="Move up"
            className="rounded-full p-2 text-ink-soft ring-1 ring-line disabled:opacity-30 hover:text-forest-800"
          >
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="Move down"
            className="rounded-full p-2 text-ink-soft ring-1 ring-line disabled:opacity-30 hover:text-forest-800"
          >
            <IconChevron className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconCheck className="h-3.5 w-3.5" />
            {saved ? "Saved" : "Save zone"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={false}
            aria-label="Delete zone"
            className="rounded-full p-2 text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className={label}>Zone name</span>
          <input className={`${field} bg-ivory-100/60`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Delivery charge (৳)</span>
          <input
            className={`${field} bg-ivory-100/60`}
            type="number"
            min="0"
            step="1"
            value={chargeTaka}
            onChange={(e) => setChargeTaka(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={label}>Estimated arrival</span>
          <input className={`${field} bg-ivory-100/60`} value={eta} onChange={(e) => setEta(e.target.value)} placeholder="45–50 min" />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Covered areas (one per line)</span>
          <textarea
            className={`${field} min-h-20 resize-y bg-ivory-100/60`}
            value={areasText}
            onChange={(e) => setAreasText(e.target.value)}
          />
        </label>
        <div>
          <span className={label}>Active for checkout</span>
          <label className="flex items-center gap-2.5 rounded-xl bg-ivory-100/60 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded accent-forest-700"
            />
            Customers can select this zone
          </label>
        </div>
      </div>
      <p className={hint}>
        Checkout & the Track flow read these live: saving here changes the
        charge and ETA the customer sees when choosing their area (§20–21).
      </p>
    </div>
  );
}

/** §20–21 delivery-zone manager — shared store with the public checkout. */
export default function AdminZonesPage() {
  const { zones, saveZone, removeZone, moveZone, reset } = useZones();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    saveZone({
      id: nextZoneId(zones),
      name,
      areas: [],
      charge: bdt(80),
      etaLabel: "45–55 min",
      active: true,
    });
    setNewName("");
    setAdding(false);
  };

  const del = (z: DeliveryZone) => {
    // The last zone can never be removed — say so instead of asking a
    // question whose "OK" then failed with a second alert.
    if (zones.length <= 1) {
      window.alert(
        "Keep at least one delivery zone — checkout needs a default.",
      );
      return;
    }
    if (
      !window.confirm(
        `Delete “${z.name}”? Customers will no longer see it at checkout.`,
      )
    ) {
      return;
    }
    if (!removeZone(z.id)) {
      window.alert("Keep at least one delivery zone.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Delivery zones
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Zone-based pricing instead of a flat fee (§20). Charges and ETAs
            update the customer checkout instantly.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset zones to the seeded sample areas?")) reset();
            }}
            className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
          >
            Reset demo zones
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconPlus className="h-4 w-4" />
            {adding ? "Cancel" : "New zone"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className={field}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
              placeholder="e.g. Zone D — Extended Ring"
              aria-label="New zone name"
            />
            <button
              type="button"
              onClick={add}
              className="rounded-xl bg-forest-800 px-6 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
            >
              Add zone
            </button>
          </div>
          <p className={hint}>Fill in the areas, charge and ETA in the new row.</p>
        </div>
      )}

      {zones.map((z, i) => (
        <ZoneRow
          /* Keyed on the stored values so "Reset demo zones" (or any external
             change) refreshes the row inputs instead of leaving stale text. */
          key={`${z.id}:${z.name}:${z.charge}:${z.etaLabel}:${z.areas.join(",")}:${z.active !== false}`}
          zone={z}
          first={i === 0}
          last={i === zones.length - 1}
          onSave={saveZone}
          onMove={(dir) => moveZone(z.id, dir)}
          onDelete={() => del(z)}
        />
      ))}
    </div>
  );
}
