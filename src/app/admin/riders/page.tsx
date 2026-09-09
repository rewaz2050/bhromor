"use client";

import { useMemo, useState } from "react";
import { useRiders } from "@/lib/use-riders";
import { useZones } from "@/lib/use-zones";
import type { Rider } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconPlus } from "@/components/ui/icons";

type Filter = Rider["status"] | "all";
const FILTERS: Filter[] = ["all", "pending", "active", "suspended"];

const BADGE: Record<Rider["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-rose-100 text-rose-800",
};

const VEHICLES: { id: Rider["vehicle"]; label: string }[] = [
  { id: "bicycle", label: "Bicycle" },
  { id: "bike", label: "Motorbike" },
  { id: "scooter", label: "Scooter" },
];

const vehicleLabel = (vehicle: Rider["vehicle"]): string =>
  VEHICLES.find((v) => v.id === vehicle)?.label ?? vehicle;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^01\d{9}$/;

function RiderCard({
  rider,
  zones,
  live,
  onSave,
  onStatus,
  onLinkRider,
}: {
  rider: Rider;
  zones: { id: string; name: string }[];
  live: boolean;
  onSave: (r: Rider) => Promise<boolean>;
  onStatus: (id: string, status: Rider["status"]) => void;
  onLinkRider: (id: string, email: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(rider.name);
  const [phone, setPhone] = useState(rider.phone);
  const [email, setEmail] = useState(rider.contactEmail ?? "");
  const [vehicle, setVehicle] = useState<Rider["vehicle"]>(rider.vehicle);
  const [zoneIds, setZoneIds] = useState<string[]>([...rider.zoneIds]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkEmail, setLinkEmail] = useState(rider.contactEmail ?? "");
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);

  const save = async () => {
    const cleanedName = name.trim();
    const cleanedPhone = phone.replace(/[\s-]/g, "");
    const cleanedEmail = email.trim().toLowerCase();
    if (cleanedName.length < 2) {
      setFormError("Rider name is too short.");
      return;
    }
    if (!PHONE_RE.test(cleanedPhone)) {
      setFormError("A valid Bangladeshi mobile number is required.");
      return;
    }
    if (cleanedEmail !== "" && !EMAIL_RE.test(cleanedEmail)) {
      setFormError("Enter a valid login email, or leave it blank.");
      return;
    }
    setSaving(true);
    const ok = await onSave({
      ...rider,
      name: cleanedName,
      phone: cleanedPhone,
      contactEmail: cleanedEmail || undefined,
      vehicle,
      zoneIds,
    });
    setSaving(false);
    if (!ok) return; // page banner carries the hook error
    setFormError(null);
    setOpen(false);
  };

  return (
    <li className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-medium text-forest-900">
              {rider.name}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${BADGE[rider.status]}`}>
              {rider.status}
            </span>
            {rider.status === "active" && (
              <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${rider.isOnline ? "bg-forest-100 text-forest-800" : "bg-ivory-200 text-ink-soft"}`}>
                {rider.isOnline ? "Online" : "Offline"}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-ink-soft">
            {rider.contactEmail ?? "no email"} · {rider.phone} ·{" "}
            {vehicleLabel(rider.vehicle)} · {rider.zoneIds.length} zones
            {rider.cashInHand > 0 && (
              <> · cash held {formatBdt(rider.cashInHand)}</>
            )}
            {rider.ratingCount > 0 && (
              <> · ★ {rider.ratingAvg.toFixed(1)} ({rider.ratingCount})</>
            )}
          </p>
        </div>
        {rider.status === "pending" && (
          <button
            type="button"
            onClick={() => onStatus(rider.id, "active")}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <IconCheck className="h-3.5 w-3.5" /> Approve
          </button>
        )}
        {rider.status !== "suspended" && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Suspend “${rider.name}”? Future dispatch offers stop immediately.`)) {
                onStatus(rider.id, "suspended");
              }
            }}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
          >
            Suspend
          </button>
        )}
        {rider.status === "suspended" && (
          <button
            type="button"
            onClick={() => onStatus(rider.id, "active")}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50"
          >
            Re-activate
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-ink"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200 sm:col-span-2">
              {formError}
            </p>
          )}
          <label className="block">
            <span className={label}>Rider name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Phone</span>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Login email</span>
            <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Vehicle</span>
            <select
              className={field}
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as Rider["vehicle"])}
            >
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <span className={label}>Home zones</span>
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => {
                const checked = zoneIds.includes(z.id);
                return (
                  <label
                    key={z.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${checked ? "bg-forest-800 text-ivory-50 ring-forest-800" : "bg-white text-ink-soft ring-line"}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setZoneIds((ids) =>
                          checked ? ids.filter((x) => x !== z.id) : [...ids, z.id],
                        )
                      }
                    />
                    {z.name}
                  </label>
                );
              })}
            </div>
          </div>
          <p className="text-xs leading-5 text-ink-soft sm:col-span-2">
            Cash in hand {formatBdt(rider.cashInHand)} · rating{" "}
            {rider.ratingCount > 0
              ? `★ ${rider.ratingAvg.toFixed(1)} (${rider.ratingCount})`
              : "not rated yet"}{" "}
            · earned only through deliveries and settlements.
          </p>
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-60"
            >
              <IconCheck className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="rounded-xl bg-cream/70 p-3 ring-1 ring-line sm:col-span-2">
            <span className={label}>Rider login</span>
            {linked ? (
              <p className="text-xs font-medium text-forest-800">
                Linked — the rider can sign in to /rider once the account is active.
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${field} flex-1`}
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="rider account email"
                  aria-label="Rider account email"
                  disabled={!live}
                />
                <button
                  type="button"
                  disabled={linking || !live || linkEmail.trim() === ""}
                  onClick={() => {
                    setLinking(true);
                    void onLinkRider(rider.id, linkEmail.trim()).then((ok) => {
                      setLinking(false);
                      if (ok) setLinked(true);
                    });
                  }}
                  className="rounded-full bg-paper px-4 py-2 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50 disabled:opacity-60"
                >
                  {linking ? "Linking…" : "Link rider"}
                </button>
              </div>
            )}
            {!live && (
              <p className="mt-1 text-xs text-ink-soft">
                Rider linking needs live mode — demo riders have no accounts.
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Marketplace phase 3 — staff rider queue: approve / suspend / zones. */
export default function AdminRidersPage() {
  const { riders, live, loading, error, clearError, saveRider, setStatus, linkRider, reset } =
    useRiders();
  const { zones } = useZones();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newVehicle, setNewVehicle] = useState<Rider["vehicle"]>("bike");
  const [createError, setCreateError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: riders.length,
      pending: 0,
      active: 0,
      suspended: 0,
    };
    for (const r of riders) c[r.status] += 1;
    return c;
  }, [riders]);
  const visible = useMemo(
    () => riders.filter((r) => (filter === "all" ? true : r.status === filter)),
    [riders, filter],
  );

  const create = async () => {
    const name = newName.trim();
    const phone = newPhone.replace(/[\s-]/g, "");
    const email = newEmail.trim().toLowerCase();
    if (name.length < 2) {
      setCreateError("Rider name is too short.");
      return;
    }
    if (!PHONE_RE.test(phone)) {
      setCreateError("A valid Bangladeshi mobile number is required.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setCreateError("A login email is required — it becomes the rider account.");
      return;
    }
    const ok = await saveRider({
      id: live ? "" : `rider-demo-${Date.now()}`,
      name,
      phone,
      contactEmail: email,
      vehicle: newVehicle,
      zoneIds: [],
      status: "pending",
      isOnline: false,
      cashInHand: 0,
      ratingAvg: 0,
      ratingCount: 0,
    });
    if (!ok) return;
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewVehicle("bike");
    setCreateError(null);
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading riders">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {error}{" "}
          <button type="button" onClick={clearError} className="underline underline-offset-2">
            Dismiss
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Riders
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Application queue + availability control. Approving a linked rider
            unlocks /rider — suspending stops future dispatch offers immediately.
          </p>
        </div>
        <div className="flex gap-2">
          {!live && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset riders to the seeded demo queue?")) reset();
              }}
              className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
            >
              Reset demo riders
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconPlus className="h-4 w-4" />
            {creating ? "Cancel" : "New rider"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
              filter === s
                ? "bg-forest-800 text-ivory-50"
                : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
            }`}
          >
            {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
            <span className={`rounded-full px-1.5 text-[0.65rem] font-bold ${filter === s ? "bg-white/20 text-ivory-50" : "bg-ivory-100 text-ink-soft"}`}>
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {creating && (
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          {createError && (
            <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
              {createError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              className={field}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Rider name *"
              aria-label="Rider name"
            />
            <input
              className={field}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone (01…) *"
              aria-label="Phone"
            />
            <input
              className={field}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Login email *"
              aria-label="Login email"
            />
            <label className="block">
              <span className={label}>Vehicle</span>
              <select
                className={field}
                value={newVehicle}
                onChange={(e) => setNewVehicle(e.target.value as Rider["vehicle"])}
              >
                {VEHICLES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={hint}>Manual intake lands pending — approve after verification. Zones are set in Edit.</p>
          <button
            type="button"
            onClick={() => void create()}
            className="mt-3 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            Create pending rider
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">Queue is clear</p>
          <p className="mt-1 text-sm text-ink-soft">
            Nothing matches this filter right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((r) => (
            <RiderCard
              key={r.id}
              rider={r}
              zones={zones}
              live={live}
              onSave={saveRider}
              onStatus={(id, status) => void setStatus(id, status)}
              onLinkRider={linkRider}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
