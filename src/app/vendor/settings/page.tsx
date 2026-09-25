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
  const profileFields = [values.name, values.tagline, values.phone, values.address, values.logoUrl];
  const completed = profileFields.filter((value) => value.trim() !== "").length;
  const completion = Math.round((completed / profileFields.length) * 100);
  const initial = values.name.trim().charAt(0).toUpperCase() || "S";

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
    <div className="max-w-3xl">
      <PageHeader
        title="দোকানের প্রোফাইল"
        sub={isStaff ? "Staff account — আপনি দোকান খোলা/বন্ধ ও preparation time সামলাতে পারবেন।" : "Customer আপনার দোকান যেভাবে দেখবে, এখানে সেভাবেই সাজান।"}
      />

      <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
        <div className="bg-gradient-to-r from-forest-950 to-forest-800 p-5 text-ivory-50 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-400 text-xl font-bold text-forest-950 shadow-sm">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-2xl">{values.name || "দোকানের নাম"}</h2>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  current.isOpen ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40" : "bg-rose-400/20 text-rose-100 ring-1 ring-rose-300/40"
                }`}>
                  {current.isOpen ? "খোলা" : "বন্ধ"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-ivory-200">
                {values.tagline || "এক লাইনে আপনার দোকানের বিশেষত্ব লিখুন"}
              </p>
              <p className="mt-2 text-xs text-ivory-200/80">
                {values.phone || "ফোন দেওয়া হয়নি"} · প্রস্তুতি {values.prepMinutes || "0"} মিনিট
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-forest-900">Profile completeness</span>
            <span className="font-bold text-forest-800">{completion}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ivory-200">
            <div className="h-full rounded-full bg-gold-500 transition-[width]" style={{ width: `${completion}%` }} />
          </div>
          {completion < 100 && (
            <p className="mt-2 text-[11px] text-ink-soft">Logo, tagline, phone ও address পূরণ করলে customer-এর কাছে দোকান বেশি বিশ্বাসযোগ্য দেখাবে।</p>
          )}
        </div>
      </section>

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}
      {saved && (
        <p className="mb-4 rounded-xl bg-forest-50 px-4 py-3 text-sm font-medium text-forest-900 ring-1 ring-forest-200">
          ✓ দোকানের প্রোফাইল সেভ হয়েছে।
        </p>
      )}

      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-paper p-5 ring-1 ring-line">
        <div>
          <p className="text-sm font-semibold text-forest-900">
            দোকান এখন {current.isOpen ? "খোলা" : "বন্ধ"}
          </p>
          <p className="text-xs text-ink-soft">
            বন্ধ করলে নতুন order আসবে না; আগের order-গুলোর কাজ চলবে।
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
          {current.isOpen ? "দোকান বন্ধ করুন" : "দোকান খুলুন"}
        </button>
      </div>

      <form
        onSubmit={save}
        className="space-y-4 rounded-2xl bg-paper p-6 ring-1 ring-line"
      >
        <fieldset disabled={isStaff} className="space-y-4 disabled:opacity-60">
          <label className="block">
            <span className={label}>দোকানের নাম *</span>
            <input
              className={field}
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={80}
            />
          </label>
          <label className="block">
            <span className={label}>এক লাইনের পরিচয় (Tagline)</span>
            <input
              className={field}
              value={values.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={200}
              placeholder="যেমন: সিলেটের প্রিমিয়াম পাঞ্জাবি"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Customer-এর যোগাযোগ নম্বর</span>
              <input
                className={field}
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={20}
              />
            </label>
            <label className="block">
              <span className={label}>Logo link</span>
              <input
                className={field}
                value={values.logoUrl}
                onChange={(e) => set("logoUrl", e.target.value)}
                placeholder="https://… (Media-তে upload করা logo-এর link)"
              />
            </label>
          </div>
          <label className="block">
            <span className={label}>দোকানের ঠিকানা</span>
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
            <span className={label}>Order প্রস্তুত করতে সময় (মিনিট)</span>
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
              Commission ও delivery zone Admin ঠিক করে; পরিবর্তন দরকার হলে support-এ বলুন।
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
        >
          {saving ? "সেভ হচ্ছে…" : "পরিবর্তন সেভ করুন"}
        </button>
      </form>
    </div>
  );
}
