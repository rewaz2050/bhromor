"use client";

import { useState } from "react";
import { useCoupons } from "@/lib/use-coupons";
import { useCatalog } from "@/lib/use-catalog";
import { useLiveZones } from "@/lib/use-live-zones";
import {
  findCoupon,
  normalizeCode,
  couponDisplayValue,
  type Coupon,
  type CouponType,
} from "@/lib/coupons";
import { bdt, formatBdt } from "@/lib/format";
import { field, hint, label } from "@/components/admin/form-ui";
import {
  IconCheck,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";

const fmtDate = (ms: number | undefined): string =>
  ms ? new Date(ms).toISOString().slice(0, 10) : "";

const parseOptionalNumber = (
  raw: string,
): { ok: true; value?: number } | { ok: false } => {
  if (!raw.trim()) return { ok: true };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
};

/** §56 promotions — Sunamganj real coupon admin with full controls. */
export default function AdminCouponsPage() {
  const { coupons, live, loading, error, clearError, save, remove, reset } =
    useCoupons();
  const { categories } = useCatalog();
  const { activeZones } = useLiveZones();
  const categoryNameOf = (id: string): string =>
    categories.find((c) => c.id === id)?.name ?? id;
  const zoneNameOf = (id: string): string =>
    activeZones.find((z) => z.id === id)?.name ?? id;

  // New-coupon form
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("fixed");
  const [value, setValue] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minTaka, setMinTaka] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [description, setDescription] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Row state (edit)
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editUntil, setEditUntil] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const create = async () => {
    const c = normalizeCode(code);
    if (c.length < 3) return setFormError("Code must be at least 3 characters.");
    if (findCoupon(coupons, c))
      return setFormError(`“${c}” already exists.`);
    
    let val = 0;
    if (type !== "free_delivery") {
      val = Number(value);
      if (!Number.isFinite(val) || val <= 0)
        return setFormError("Enter a positive value.");
      if (type === "percent" && val > 100)
        return setFormError("Percent discount cannot exceed 100%.");
      if (type === "fixed" && val > 10000)
        return setFormError("Keep fixed amount realistic (max ৳10000).");
    }
    
    const maxD = parseOptionalNumber(maxDiscount);
    if (!maxD.ok) return setFormError("Max discount must be positive.");
    if (type !== "percent" && maxD.value !== undefined)
      return setFormError("Max discount only applies to percent type.");
    
    const min = parseOptionalNumber(minTaka);
    if (!min.ok) return setFormError("Minimum order must be positive.");
    const limit = parseOptionalNumber(usageLimit);
    if (!limit.ok || (limit.value !== undefined && limit.value < 1))
      return setFormError("Usage limit must be whole number.");
    
    const now = Date.now();
    const until = validUntil ? new Date(`${validUntil}T23:59:59`).getTime() : undefined;
    if (until !== undefined && !Number.isFinite(until))
      return setFormError("End date invalid.");
    if (until && until <= now)
      return setFormError("End date must be future.");

    const payload = {
      code: c,
      type,
      value: type === "fixed" ? bdt(val) : type === "percent" ? val : 0,
      maxDiscount: maxD.value !== undefined ? bdt(maxD.value) : undefined,
      minOrder: min.value !== undefined ? bdt(min.value) : 0,
      categoryId: categoryId || undefined,
      zoneId: zoneId || undefined,
      description: description.trim() || undefined,
      validUntil: until,
      usageLimit:
        limit.value !== undefined ? Math.floor(limit.value) : undefined,
      used: 0,
      active: true,
    };
    
    const ok = await save({
      ...payload,
      id: live ? "" : `c${Date.now()}`,
    });
    if (!ok) return;
    setCode("");
    setValue("");
    setMaxDiscount("");
    setMinTaka("");
    setCategoryId("");
    setZoneId("");
    setDescription("");
    setValidUntil("");
    setUsageLimit("");
    setOpen(false);
    setFormError(null);
  };

  const startEdit = (c: Coupon) => {
    setEditing(c.id);
    setEditValue(String(c.type === "fixed" ? c.value / 100 : c.value));
    setEditMax(c.maxDiscount ? String(c.maxDiscount / 100) : "");
    setEditMin(String(c.minOrder ? c.minOrder / 100 : ""));
    setEditLimit(c.usageLimit != null ? String(c.usageLimit) : "");
    setEditUntil(fmtDate(c.validUntil));
    setEditDesc(c.description ?? "");
  };

  const commitEdit = async (c: Coupon) => {
    let val = c.value;
    if (c.type !== "free_delivery") {
      const num = Number(editValue);
      if (!Number.isFinite(num) || num <= 0 || (c.type === "percent" && num > 100))
        return setFormError(
          c.type === "percent"
            ? "Percent must be 1-100."
            : "Discount must be positive.",
        );
      val = c.type === "fixed" ? bdt(num) : num;
    }
    const maxD = parseOptionalNumber(editMax);
    if (!maxD.ok) return setFormError("Max discount invalid.");
    const min = parseOptionalNumber(editMin);
    const limit = parseOptionalNumber(editLimit);
    if (!min.ok) return setFormError("Min order invalid.");
    if (!limit.ok) return setFormError("Usage limit invalid.");
    const until = editUntil ? new Date(`${editUntil}T23:59:59`).getTime() : undefined;
    if (until !== undefined && !Number.isFinite(until))
      return setFormError("End date invalid.");
    
    const ok = await save({
      ...c,
      value: val,
      maxDiscount: maxD.value !== undefined ? bdt(maxD.value) : undefined,
      minOrder: min.value !== undefined ? bdt(min.value) : 0,
      usageLimit:
        limit.value !== undefined ? Math.floor(limit.value) : undefined,
      validUntil: until,
      description: editDesc.trim() || undefined,
    });
    if (!ok) return;
    setFormError(null);
    setEditing(null);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading coupons">
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
          <button
            type="button"
            onClick={clearError}
            className="underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Promo Codes — Sunamganj Sadar
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Create discount codes: <strong>% percent</strong>, <strong>৳ fixed</strong>, or <strong>free delivery</strong>. Real, no demo — controls min order, category, zone, expiry, usage.
          </p>
        </div>
        <div className="flex gap-2">
          {!live && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset coupons to seeded samples?")) reset();
              }}
              className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line hover:bg-paper hover:text-forest-800"
            >
              Reset demo
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
          >
            <IconPlus className="h-4 w-4" />
            {open ? "Cancel" : "New promo code"}
          </button>
        </div>
      </div>

      {formError && !open && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {formError}
        </p>
      )}

      {open && (
        <div className="rounded-2xl bg-paper p-6 ring-1 ring-line">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
            New promo code — Sunamganj real
          </h3>
          {formError && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Code * (e.g. SUNAMGANJ15)</span>
              <input className={field} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUNAMGANJ15" />
            </label>
            <div className="sm:col-span-2">
              <span className={label}>Type *</span>
              <div className="flex overflow-hidden rounded-xl ring-1 ring-line">
                {[
                  { id: "fixed" as CouponType, label: "৳ Fixed", desc: "৳100 off" },
                  { id: "percent" as CouponType, label: "% Percent", desc: "15% off" },
                  { id: "free_delivery" as CouponType, label: "🚚 Free Delivery", desc: "Delivery free" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    aria-pressed={type === t.id}
                    className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors ${
                      type === t.id ? "bg-forest-800 text-ivory-50" : "bg-white text-ink-soft"
                    }`}
                  >
                    <span className="block">{t.label}</span>
                    <span className="text-[10px] opacity-70">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {type !== "free_delivery" && (
              <label className="block">
                <span className={label}>{type === "fixed" ? "Amount (৳) *" : "Percent (%) * (1-100)"}</span>
                <input
                  className={field}
                  type="number"
                  min="0"
                  max={type === "percent" ? "100" : undefined}
                  step={type === "fixed" ? "1" : "1"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={type === "fixed" ? "100" : "15"}
                />
              </label>
            )}
            
            {type === "percent" && (
              <label className="block">
                <span className={label}>Max discount cap (৳) — optional</span>
                <input className={field} type="number" min="0" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="e.g. 500 = up to ৳500" />
                <span className="text-[11px] text-ink-soft">15% off up to ৳500 = max ৳500 discount</span>
              </label>
            )}

            <label className="block">
              <span className={label}>Minimum order (৳) — optional</span>
              <input className={field} type="number" min="0" value={minTaka} onChange={(e) => setMinTaka(e.target.value)} placeholder="0 = no minimum" />
            </label>

            <label className="block">
              <span className={label}>Category — optional</span>
              <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All products</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={label}>Zone — Sunamganj only, optional</span>
              <select className={field} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">All zones</option>
                {activeZones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name} — {z.areas.slice(0,2).join(", ")}</option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className={label}>Description — admin note</span>
              <input className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Eid offer for Boropara, first 100 orders" />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className={label}>Valid until</span>
                <input className={field} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </label>
              <label className="block">
                <span className={label}>Usage limit</span>
                <input className={field} type="number" min="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="∞ unlimited" />
              </label>
            </div>
          </div>

          {/* Live preview */}
          <div className="mt-5 rounded-xl bg-ivory-100 p-4 ring-1 ring-line">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Preview — how customer sees it</p>
            <p className="mt-2 text-sm font-semibold text-forest-900">
              {code || "CODE"}: {type === "free_delivery" ? "Free Delivery 🚚" : type === "fixed" ? `৳${value || "0"} off` : `${value || "0"}% off${maxDiscount ? ` up to ৳${maxDiscount}` : ""}`} 
              {minTaka ? ` · Min ৳${minTaka}` : ""} {categoryId ? ` · ${categoryNameOf(categoryId)} only` : ""} {zoneId ? ` · ${zoneNameOf(zoneId)}` : ""}
            </p>
            {description && <p className="mt-1 text-xs text-ink-soft">{description}</p>}
          </div>

          <button
            type="button"
            onClick={create}
            className="mt-5 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
          >
            Create promo code — real
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">No promo codes yet</p>
          <p className="mt-1 text-sm text-ink-soft">Create one — percent, fixed, or free delivery. All real, Sunamganj Sadar.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {coupons.map((c) => (
            <li key={c.id} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-4">
                <span className="rounded-xl bg-forest-950 px-4 py-2 font-mono text-sm font-bold tracking-wider text-gold-300">
                  {c.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink flex flex-wrap items-center gap-2">
                    {couponDisplayValue(c)}
                    {c.categoryId && (
                      <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[0.65rem] font-bold text-forest-800">
                        {categoryNameOf(c.categoryId)} only
                      </span>
                    )}
                    {c.zoneId && (
                      <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.65rem] font-bold text-gold-800">
                        {zoneNameOf(c.zoneId)}
                      </span>
                    )}
                    {c.type === "free_delivery" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-800">
                        Free Delivery
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {c.minOrder > 0 ? `Min ${formatBdt(c.minOrder)} · ` : ""}
                    {c.usageLimit != null ? `${c.used}/${c.usageLimit} used` : `${c.used} used`}
                    {c.validUntil ? ` · ends ${new Date(c.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : " · no end"}
                    {c.maxDiscount ? ` · cap ${formatBdt(c.maxDiscount)}` : ""}
                  </p>
                  {c.description && <p className="mt-1 text-xs text-ink-soft italic">{c.description}</p>}
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={(e) => void save({ ...c, active: e.target.checked })}
                    className="h-4 w-4 rounded accent-forest-700"
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-800 hover:text-ivory-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete ${c.code}?`)) void remove(c.id);
                  }}
                  aria-label={`Delete ${c.code}`}
                  className="rounded-full p-2 text-ink-soft ring-1 ring-line hover:text-rose-700 hover:ring-rose-300"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>

              {editing === c.id && (
                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
                  {c.type !== "free_delivery" && (
                    <label className="block">
                      <span className={label}>{c.type === "fixed" ? "Amount (৳)" : "Percent (%)"}</span>
                      <input className={field} type="number" min="0" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                    </label>
                  )}
                  {c.type === "percent" && (
                    <label className="block">
                      <span className={label}>Max cap (৳)</span>
                      <input className={field} type="number" min="0" value={editMax} onChange={(e) => setEditMax(e.target.value)} placeholder="∞" />
                    </label>
                  )}
                  <label className="block">
                    <span className={label}>Min order (৳)</span>
                    <input className={field} type="number" min="0" value={editMin} onChange={(e) => setEditMin(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={label}>Usage limit</span>
                    <input className={field} type="number" min="0" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} placeholder="∞" />
                  </label>
                  <label className="block">
                    <span className={label}>Valid until</span>
                    <input className={field} type="date" value={editUntil} onChange={(e) => setEditUntil(e.target.value)} />
                  </label>
                  <label className="block sm:col-span-4">
                    <span className={label}>Description</span>
                    <input className={field} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Admin note" />
                  </label>
                  <div className="flex items-end gap-2 sm:col-span-4">
                    <button
                      type="button"
                      onClick={() => commitEdit(c)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
                    >
                      <IconCheck className="h-3.5 w-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className={hint}>
        Sunamganj real: percent (e.g. 15% off up to ৳500), fixed (৳100 off), free_delivery. Zone restriction: Boropara etc only. Min order, category, expiry, usage limit all enforced at checkout — both demo and live. No demo codes added, all real.
      </p>
    </div>
  );
}
