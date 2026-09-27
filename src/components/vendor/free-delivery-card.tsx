"use client";

/**
 * Vendor → Settings: the shop's OWN free-delivery offer (2026-09-26).
 *
 * Owner-only. Toggle on + a minimum in taka; off clears the column. The
 * card is honest about who pays: the waived rider charge (base + any
 * surcharges) comes out of the shop's payout for that order. It also shows
 * the platform rule when PROSANTI has one armed, because the shopper sees
 * the lower of the two.
 */

import { useEffect, useState } from "react";
import type { Shop } from "@/lib/catalog";
import {
  FREE_DELIVERY_MAX_PAISA,
  FREE_DELIVERY_MIN_PAISA,
} from "@/lib/free-delivery";
import { bnDigits } from "@/lib/arrival";
import { patchVendorShop, vendorErrorMessage } from "@/lib/use-vendor";
import { usePublicSettings } from "@/lib/use-public-settings";
import { ErrorBox } from "@/components/vendor/vendor-ui";

const field =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600";

const takaBn = (paisa: number) => `৳${bnDigits(String(Math.round(paisa / 100)))}`;

export default function VendorFreeDeliveryCard({
  shop,
  onSaved,
  className = "",
}: {
  shop: Pick<Shop, "freeDeliveryMinPaisa">;
  onSaved: (shop: Shop) => void;
  className?: string;
}) {
  const initialMin = shop.freeDeliveryMinPaisa ?? null;
  const [enabled, setEnabled] = useState(initialMin !== null);
  const [taka, setTaka] = useState(initialMin ? String(Math.round(initialMin / 100)) : "999");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = usePublicSettings();
  const platform = settings.freeDelivery;

  // Adopt the live value when the shop row (re)loads.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption of the loaded row
    setEnabled(initialMin !== null);
    if (initialMin) setTaka(String(Math.round(initialMin / 100)));
  }, [initialMin]);

  const paisa = Math.round(Number(taka) * 100) || 0;
  const valid = !enabled || (paisa >= FREE_DELIVERY_MIN_PAISA && paisa <= FREE_DELIVERY_MAX_PAISA);
  const dirty = enabled ? paisa !== initialMin : initialMin !== null;

  const save = async () => {
    if (saving || !valid) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await patchVendorShop({ free_delivery_min: enabled ? paisa : null });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(vendorErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="vendor-free-delivery-title"
      data-testid="vendor-free-delivery"
      className={`rounded-2xl bg-paper p-6 ring-1 ring-line ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="vendor-free-delivery-title" className="font-semibold text-forest-900">
            🚚 ফ্রি ডেলিভারি অফার (ঐচ্ছিক)
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            চালু করলে সদরের রাইডার এলাকায় (কুরিয়ার নয়) এই অঙ্কের উপরে অর্ডারে গ্রাহক ডেলিভারি চার্জ দেবে না — ব্যাগে
            &ldquo;আর ৳X যোগ করলে ডেলিভারি ফ্রি&rdquo; বার দেখাবে, যা গড় অর্ডার বাড়ায়।
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-forest-900">
          <input
            type="checkbox"
            className="h-5 w-5 rounded"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
            data-testid="vendor-free-delivery-enabled"
          />
          {enabled ? "চালু" : "বন্ধ"}
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
            ন্যূনতম অর্ডার (৳)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={FREE_DELIVERY_MIN_PAISA / 100}
            max={FREE_DELIVERY_MAX_PAISA / 100}
            step={1}
            className={`${field} disabled:opacity-50`}
            value={taka}
            disabled={!enabled || saving}
            onChange={(e) => {
              setTaka(e.target.value);
              setSaved(false);
            }}
            aria-invalid={!valid}
            data-testid="vendor-free-delivery-min"
          />
          {!valid && (
            <span role="alert" className="mt-1 block text-xs font-medium text-rose-700">
              {takaBn(FREE_DELIVERY_MIN_PAISA)} থেকে {takaBn(FREE_DELIVERY_MAX_PAISA)}-এর মধ্যে একটি অঙ্ক দিন।
            </span>
          )}
        </label>
        <div className="rounded-xl bg-cream px-4 py-3 text-xs text-ink-soft ring-1 ring-line">
          <p>
            <span className="font-semibold text-forest-900">কে দেবে?</span> আপনার অফারে মাফ হওয়া রাইডার চার্জ
            (৳৬০–৳১৫০ + সারচার্জ) সেই অর্ডারের পেআউট থেকে কাটা হবে।
          </p>
          <p className="mt-1">
            <span className="font-semibold text-forest-900">প্রযোজ্য নয়:</span> কুরিয়ার (সদরের বাইরে), স্টোর পিকআপ,
            ফ্রি-ডেলিভারি কুপন, PROSANTI+ সদস্য।
          </p>
          <p className="mt-1" data-testid="vendor-free-delivery-platform">
            <span className="font-semibold text-forest-900">PROSANTI অফার:</span>{" "}
            {platform.enabled
              ? `${takaBn(platform.minSubtotalPaisa)}+ অর্ডারে PROSANTI নিজে ফ্রি ডেলিভারি দিচ্ছে (আপনার পেআউট অপরিবর্তিত)। গ্রাহক দুটির মধ্যে কম অঙ্কটি দেখবে।`
              : "এখন বন্ধ — আপনার অফারই একমাত্র ফ্রি ডেলিভারি।"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}
      {saved && (
        <p role="status" className="mt-4 rounded-xl bg-forest-50 px-4 py-3 text-sm font-medium text-forest-900 ring-1 ring-forest-200">
          {enabled
            ? `ফ্রি ডেলিভারি চালু — ${takaBn(paisa)}+ অর্ডারে।`
            : "ফ্রি ডেলিভারি অফার বন্ধ করা হয়েছে।"}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || !valid || !dirty}
        className="mt-4 min-h-11 rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
      >
        {saving ? "সেভ হচ্ছে…" : "অফার সেভ করুন"}
      </button>
    </section>
  );
}
