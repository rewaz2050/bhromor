"use client";

/**
 * Vendor shop settings (marketplace slice 3): profile fields, prep time,
 * and the open/closed sign. Owners edit everything here; staff only the
 * sign + prep. Platform fields (commission/zones) are read-only.
 */

import { useState } from "react";
import { useVendor } from "@/components/vendor/vendor-shell";
import { ErrorBox, PageHeader } from "@/components/vendor/vendor-ui";
import { patchVendorShop, vendorErrorMessage } from "@/lib/use-vendor";
import type { Shop } from "@/lib/catalog";

const field =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600";
const label =
  "mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft";

export default function VendorSettingsPage() {
  const me = useVendor();
  const [shop, setShop] = useState<Shop | null>(null);
  const current = shop ?? me?.shop ?? null;
  const isStaff = me?.role === "staff";
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!current) return null;
  const values: Record<string, string> = form ?? {
    name: current.name,
    tagline: current.tagline ?? "",
    phone: current.phone,
    address: current.address ?? "",
    logoUrl: current.logoUrl ?? "",
    prepMinutes: String(current.prepMinutes),
  };

  const set = (key: string, value: string) => {
    setForm({ ...values, [key]: value });
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Record<string, unknown> = isStaff
        ? { prep_minutes: Number(values.prepMinutes) }
        : {
            name: values.name,
            tagline: values.tagline,
            phone: values.phone,
            address: values.address,
            logo_url: values.logoUrl,
            prep_minutes: Number(values.prepMinutes),
          };
      const updated = await patchVendorShop(patch);
      setShop(updated);
      setForm(null);
      setSaved(true);
    } catch (err) {
      setError(vendorErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const flipOpen = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchVendorShop({ is_open: !current.isOpen });
      setShop(updated);
    } catch (err) {
      setError(vendorErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Shop settings"
        sub={isStaff ? "Staff account — you can manage the sign and prep time." : "How customers see your shop."}
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}
      {saved && (
        <p className="mb-4 rounded-xl bg-forest-50 px-4 py-3 text-sm font-medium text-forest-900 ring-1 ring-forest-200">
          Saved.
        </p>
      )}

      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-paper p-5 ring-1 ring-line">
        <div>
          <p className="text-sm font-semibold text-forest-900">
            Shop is {current.isOpen ? "open" : "closed"}
          </p>
          <p className="text-xs text-ink-soft">
            Closed shops stop receiving new orders immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={flipOpen}
          disabled={saving}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${
            current.isOpen
              ? "bg-paper text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
              : "bg-forest-800 text-white hover:bg-forest-900"
          }`}
        >
          {current.isOpen ? "Close shop" : "Open shop"}
        </button>
      </div>

      <form
        onSubmit={save}
        className="space-y-4 rounded-2xl bg-paper p-6 ring-1 ring-line"
      >
        <fieldset disabled={isStaff} className="space-y-4 disabled:opacity-60">
          <label className="block">
            <span className={label}>Shop name *</span>
            <input
              className={field}
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={80}
            />
          </label>
          <label className="block">
            <span className={label}>Tagline</span>
            <input
              className={field}
              value={values.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={200}
              placeholder="e.g. Premium panjabis from Sylhet"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Phone</span>
              <input
                className={field}
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={20}
              />
            </label>
            <label className="block">
              <span className={label}>Logo URL</span>
              <input
                className={field}
                value={values.logoUrl}
                onChange={(e) => set("logoUrl", e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
          <label className="block">
            <span className={label}>Address</span>
            <textarea
              className={field}
              rows={2}
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              maxLength={300}
            />
          </label>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Prep time (minutes)</span>
            <input
              type="number"
              min={0}
              max={240}
              className={field}
              value={values.prepMinutes}
              onChange={(e) => set("prepMinutes", e.target.value)}
            />
          </label>
          <div className="rounded-xl bg-cream px-4 py-3 text-xs text-ink-soft ring-1 ring-line">
            <p>
              <span className="font-semibold text-forest-900">Commission:</span>{" "}
              {Math.round(current.commissionPct)}% per order
            </p>
            <p className="mt-1">
              <span className="font-semibold text-forest-900">Zones:</span>{" "}
              {current.zoneIds.length > 0
                ? current.zoneIds.join(", ")
                : "—"}
            </p>
            <p className="mt-1">
              Set by PROSANTI — ask support to change them.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
