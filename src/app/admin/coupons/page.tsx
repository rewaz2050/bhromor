"use client";

import { useState } from "react";
import { useCoupons } from "@/lib/use-coupons";
import { useCatalog } from "@/lib/use-catalog";
import {
  findCoupon,
  normalizeCode,
  type Coupon,
} from "@/lib/coupons";
import { categoryNameOf } from "@/lib/coupons-store";
import { bdt, formatBdt } from "@/lib/format";
import { field, hint, label } from "@/components/admin/form-ui";
import {
  IconCheck,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";

const fmtDate = (ms: number | undefined): string =>
  ms ? new Date(ms).toISOString().slice(0, 10) : "";

/** §56 promotions — discount codes admin (demo store). */
export default function AdminCouponsPage() {
  const { coupons, save, remove, reset } = useCoupons();
  const { categories } = useCatalog();

  // New-coupon form
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("fixed");
  const [value, setValue] = useState("");
  const [minTaka, setMinTaka] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Row state (edit)
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editUntil, setEditUntil] = useState("");

  const create = () => {
    const c = normalizeCode(code);
    if (c.length < 3) return setFormError("Code must be at least 3 characters.");
    if (findCoupon(coupons, c))
      return setFormError(`“${c}” already exists.`);
    const val = Number(value);
    if (!Number.isFinite(val) || val <= 0)
      return setFormError("Enter a positive value.");
    if (type === "percent" && val > 100)
      return setFormError("Percent discount cannot exceed 100.");
    if (type === "fixed" && val > 100_000)
      return setFormError("Keep the fixed amount realistic (taka).");
    const now = Date.now();
    const until = validUntil ? new Date(`${validUntil}T23:59:59`).getTime() : undefined;
    if (until && until <= now)
      return setFormError("End date must be in the future.");
    save({
      id: `c${Date.now()}`,
      code: c,
      type,
      value: type === "fixed" ? bdt(val) : val,
      minOrder: minTaka.trim() ? bdt(Number(minTaka)) : 0,
      categoryId: categoryId || undefined,
      validUntil: until,
      usageLimit: usageLimit.trim() ? Math.floor(Number(usageLimit)) : undefined,
      used: 0,
      active: true,
    });
    setCode("");
    setValue("");
    setMinTaka("");
    setCategoryId("");
    setValidUntil("");
    setUsageLimit("");
    setOpen(false);
    setFormError(null);
  };

  const startEdit = (c: Coupon) => {
    setEditing(c.id);
    setEditValue(String(c.value));
    setEditMin(String(c.minOrder ? c.minOrder / 100 : ""));
    setEditLimit(c.usageLimit != null ? String(c.usageLimit) : "");
    setEditUntil(fmtDate(c.validUntil));
  };

  const commitEdit = (c: Coupon) => {
    const val = Number(editValue);
    if (!Number.isFinite(val) || val <= 0 || (c.type === "percent" && val > 100)) return;
    const until = editUntil ? new Date(`${editUntil}T23:59:59`).getTime() : undefined;
    save({
      ...c,
      value: c.type === "fixed" ? bdt(val) : val,
      minOrder: editMin.trim() ? bdt(Number(editMin)) : 0,
      usageLimit: editLimit.trim() ? Math.floor(Number(editLimit)) : undefined,
      validUntil: until,
    });
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Coupons
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Discount codes customers can apply at checkout (§56).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset coupons to the seeded samples?")) reset();
            }}
            className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
          >
            Reset demo codes
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconPlus className="h-4 w-4" />
            {open ? "Cancel" : "New coupon"}
          </button>
        </div>
      </div>

      {open && (
        <div className="rounded-2xl bg-paper p-6 ring-1 ring-line">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
            New coupon
          </h3>
          {formError && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Code *</span>
              <input className={field} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FESTIVE20" />
            </label>
            <div>
              <span className={label}>Type</span>
              <div className="flex overflow-hidden rounded-xl ring-1 ring-line">
                {(["fixed", "percent"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={type === t}
                    className={`flex-1 px-3 py-2.5 text-sm font-semibold transition-colors ${
                      type === t ? "bg-forest-800 text-ivory-50" : "bg-white text-ink-soft"
                    }`}
                  >
                    {t === "fixed" ? "৳ Fixed" : "% Percent"}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className={label}>{type === "fixed" ? "Amount (৳)" : "Percent (%)"} *</span>
              <input
                className={field}
                type="number"
                min="0"
                step={type === "fixed" ? "1" : "any"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Minimum order (৳)</span>
              <input className={field} type="number" min="0" value={minTaka} onChange={(e) => setMinTaka(e.target.value)} placeholder="0" />
            </label>
            <label className="block">
              <span className={label}>Restrict to category</span>
              <select className={field} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All products</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className={label}>Valid until</span>
                <input className={field} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </label>
              <label className="block">
                <span className={label}>Usage limit</span>
                <input className={field} type="number" min="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="∞" />
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={create}
            className="mt-5 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            Create coupon
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">No coupons yet</p>
          <p className="mt-1 text-sm text-ink-soft">Create one to offer customers a discount.</p>
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
                  <p className="text-sm font-semibold text-ink">
                    {c.type === "fixed" ? formatBdt(c.value) : `${c.value}%`} off
                    {c.categoryId && (
                      <span className="ml-2 rounded-full bg-forest-100 px-2 py-0.5 text-[0.65rem] font-bold text-forest-800">
                        {categoryNameOf(c.categoryId)} only
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {c.minOrder > 0 ? `Min. order ${formatBdt(c.minOrder)} · ` : ""}
                    {c.usageLimit != null
                      ? `${c.used}/${c.usageLimit} used`
                      : `${c.used} used`}
                    {c.validUntil
                      ? ` · ends ${new Date(c.validUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                      : " · no end date"}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={(e) => save({ ...c, active: e.target.checked })}
                    className="h-4 w-4 rounded accent-forest-700"
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete coupon ${c.code}?`)) remove(c.id);
                  }}
                  aria-label={`Delete ${c.code}`}
                  className="rounded-full p-2 text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>

              {editing === c.id && (
                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
                  <label className="block">
                    <span className={label}>
                      {c.type === "fixed" ? "Amount (৳)" : "Percent (%)"}
                    </span>
                    <input className={field} type="number" min="0" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className={label}>Min. order (৳)</span>
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
        Duplicate-code protection is enforced on create; checkout validates
        active window, minimum order and usage limit at apply time.
      </p>
    </div>
  );
}
