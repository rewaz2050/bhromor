"use client";

import { useMemo, useState } from "react";
import { useShops, type AdminShopClient } from "@/lib/use-shops";
import { useZones } from "@/lib/use-zones";
import type { Shop } from "@/lib/catalog";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconPlus } from "@/components/ui/icons";

type Filter = Shop["status"] | "all";
const FILTERS: Filter[] = ["all", "pending", "active", "suspended"];

const BADGE: Record<Shop["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-rose-100 text-rose-800",
};

function ShopCard({
  shop,
  zones,
  onSave,
  onStatus,
}: {
  shop: AdminShopClient;
  zones: { id: string; name: string }[];
  onSave: (s: Shop) => Promise<boolean>;
  onStatus: (id: string, status: Shop["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shop.name);
  const [tagline, setTagline] = useState(shop.tagline ?? "");
  const [phone, setPhone] = useState(shop.phone);
  const [address, setAddress] = useState(shop.address ?? "");
  const [commission, setCommission] = useState(String(shop.commissionPct));
  const [prep, setPrep] = useState(String(shop.prepMinutes));
  const [zoneIds, setZoneIds] = useState<string[]>([...shop.zoneIds]);
  const [isOpen, setIsOpen] = useState(shop.isOpen);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const pct = Number(commission);
    const prepMin = Math.floor(Number(prep));
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
      setFormError("Commission must be between 0 and 90 percent.");
      return;
    }
    if (!Number.isFinite(prepMin) || prepMin < 0 || prepMin > 240) {
      setFormError("Prep time must be between 0 and 240 minutes.");
      return;
    }
    setSaving(true);
    const ok = await onSave({
      ...shop,
      name: name.trim() || shop.name,
      tagline: tagline.trim() || undefined,
      phone: phone.trim(),
      address: address.trim() || undefined,
      commissionPct: pct,
      prepMinutes: prepMin,
      zoneIds,
      isOpen,
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
              {shop.name}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${BADGE[shop.status]}`}>
              {shop.status}
            </span>
            {shop.status === "active" && (
              <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${shop.isOpen ? "bg-forest-100 text-forest-800" : "bg-ivory-200 text-ink-soft"}`}>
                {shop.isOpen ? "Open" : "Closed"}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-ink-soft">
            {shop.contactEmail ?? "no email"} · {shop.phone || "no phone"} ·{" "}
            {shop.productCount} products · {shop.zoneIds.length} zones ·{" "}
            {shop.commissionPct}% commission
            {shop.ratingCount > 0 && (
              <> · ★ {shop.ratingAvg.toFixed(1)} ({shop.ratingCount})</>
            )}
          </p>
        </div>
        {shop.status === "pending" && (
          <button
            type="button"
            onClick={() => onStatus(shop.id, "active")}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <IconCheck className="h-3.5 w-3.5" /> Approve
          </button>
        )}
        {shop.status !== "suspended" && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Suspend “${shop.name}”? Its products disappear from the storefront immediately.`)) {
                onStatus(shop.id, "suspended");
              }
            }}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50"
          >
            Suspend
          </button>
        )}
        {shop.status === "suspended" && (
          <button
            type="button"
            onClick={() => onStatus(shop.id, "active")}
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
            <span className={label}>Shop name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Phone</span>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Tagline</span>
            <input className={field} value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Address</span>
            <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Commission (%)</span>
            <input className={field} type="number" min="0" max="90" step="any" value={commission} onChange={(e) => setCommission(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Prep time (min)</span>
            <input className={field} type="number" min="0" max="240" value={prep} onChange={(e) => setPrep(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <span className={label}>Serves zones</span>
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
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input
              type="checkbox"
              checked={isOpen}
              disabled={shop.status !== "active"}
              onChange={(e) => setIsOpen(e.target.checked)}
              className="h-4 w-4 rounded accent-forest-700"
            />
            Open for orders
            {shop.status !== "active" && (
              <span className="text-xs text-ink-soft">(approve first)</span>
            )}
          </label>
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
        </div>
      )}
    </li>
  );
}

/** Marketplace phase 2 — staff shops queue: approve / suspend / commission. */
export default function AdminShopsPage() {
  const { shops, live, loading, error, clearError, saveShop, setStatus, reset } =
    useShops();
  const { zones } = useZones();
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: shops.length,
      pending: 0,
      active: 0,
      suspended: 0,
    };
    for (const s of shops) c[s.status] += 1;
    return c;
  }, [shops]);
  const visible = useMemo(
    () => shops.filter((s) => (filter === "all" ? true : s.status === filter)),
    [shops, filter],
  );

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2) {
      setCreateError("Shop name is too short.");
      return;
    }
    const ok = await saveShop({
      id: live ? "" : `shop-demo-${Date.now()}`,
      slug: live ? "" : name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      phone: newPhone.trim(),
      contactEmail: newEmail.trim().toLowerCase() || undefined,
      zoneIds: [],
      prepMinutes: 15,
      commissionPct: 15,
      status: "pending",
      isOpen: false,
      ratingAvg: 0,
      ratingCount: 0,
    });
    if (!ok) return;
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setCreateError(null);
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading shops">
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
            Shops
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Onboarding queue + commission control. Approving puts a shop on the
            storefront — suspending removes it instantly.
          </p>
        </div>
        <div className="flex gap-2">
          {!live && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset shops to the seeded demo shop?")) reset();
              }}
              className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
            >
              Reset demo shops
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconPlus className="h-4 w-4" />
            {creating ? "Cancel" : "New shop"}
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
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className={field}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Shop name *"
              aria-label="Shop name"
            />
            <input
              className={field}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone (01…)"
              aria-label="Phone"
            />
            <input
              className={field}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Contact email"
              aria-label="Contact email"
            />
          </div>
          <p className={hint}>Manual intake lands pending — approve after verification. Zones, prep and commission are set in Edit.</p>
          <button
            type="button"
            onClick={() => void create()}
            className="mt-3 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            Create pending shop
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
          {visible.map((s) => (
            <ShopCard
              key={s.id}
              shop={s}
              zones={zones}
              onSave={saveShop}
              onStatus={(id, status) => void setStatus(id, status)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
