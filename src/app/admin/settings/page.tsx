"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import { useCatalog } from "@/lib/use-catalog";
import { useZones } from "@/lib/use-zones";
import { useReviews } from "@/lib/use-reviews";
import { useCoupons } from "@/lib/use-coupons";
import { useNotifications } from "@/lib/use-notifications";
import { useCms } from "@/lib/use-cms";
import { useSettings } from "@/lib/use-settings";
import { resetDemoMessages } from "@/lib/engagement";
import { resetMediaStore } from "@/lib/media-store";
import { displayStock } from "@/lib/catalog-store";
import { useTransientValue } from "@/lib/use-transient-value";
import { field, label } from "@/components/admin/form-ui";
import {
  IconBanknote,
  IconCheck,
  IconGift,
  IconSettings,
} from "@/components/ui/icons";

/**
 * Settings (§58 ops + §loyalty reward program + demo-phase housekeeping).
 * Staff sessions persist the settings in `site_settings['ops']` (§44); the
 * demo-data housekeeping below only exists in demo mode.
 */

export default function AdminSettingsPage() {
  const { settings, save: saveSettings, live } = useSettings();
  const ordersApi = useOrders();
  const catalogApi = useCatalog();
  const zonesApi = useZones();
  const reviewsApi = useReviews();
  const couponsApi = useCoupons();
  const notifsApi = useNotifications();
  const cmsApi = useCms();

  const [threshold, setThreshold] = useState(String(settings.lowStockThreshold));
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(settings.loyaltyEnabled);
  const [loyaltyTarget, setLoyaltyTarget] = useState(String(settings.loyaltyTargetOrders));
  const [loyaltyRewardTitle, setLoyaltyRewardTitle] = useState(settings.loyaltyRewardTitle);
  const [loyaltyRewardDesc, setLoyaltyRewardDesc] = useState(settings.loyaltyRewardDescription);
  const [loyaltyMinAmount, setLoyaltyMinAmount] = useState(String(settings.loyaltyMinOrderAmount));
  const [rainEnabled, setRainEnabled] = useState(settings.rainSurchargeEnabled);
  const [nightEnabled, setNightEnabled] = useState(settings.nightSurchargeEnabled);
  const [expressEnabled, setExpressEnabled] = useState(settings.expressDeliveryEnabled);
  const [perZoneFreeEnabled, setPerZoneFreeEnabled] = useState(settings.perZoneFreeThresholdEnabled);

  const [flash, setFlash] = useTransientValue<string | null>(null, 2200);

  // Live rows arrive async — adopt the published values when they land.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption
    setThreshold(String(settings.lowStockThreshold));
    setLoyaltyEnabled(settings.loyaltyEnabled);
    setLoyaltyTarget(String(settings.loyaltyTargetOrders));
    setLoyaltyRewardTitle(settings.loyaltyRewardTitle);
    setLoyaltyRewardDesc(settings.loyaltyRewardDescription);
    setLoyaltyMinAmount(String(settings.loyaltyMinOrderAmount));
    setRainEnabled(settings.rainSurchargeEnabled);
    setNightEnabled(settings.nightSurchargeEnabled);
    setExpressEnabled(settings.expressDeliveryEnabled);
    setPerZoneFreeEnabled(settings.perZoneFreeThresholdEnabled);
  }, [
    settings.lowStockThreshold,
    settings.loyaltyEnabled,
    settings.loyaltyTargetOrders,
    settings.loyaltyRewardTitle,
    settings.loyaltyRewardDescription,
    settings.loyaltyMinOrderAmount,
    settings.rainSurchargeEnabled,
    settings.nightSurchargeEnabled,
    settings.expressDeliveryEnabled,
    settings.perZoneFreeThresholdEnabled,
  ]);

  const thresholdValue = Math.max(0, Math.floor(Number(threshold) || 0));
  const lowCount = catalogApi.products.filter(
    (p) => displayStock(p) > 0 && displayStock(p) <= thresholdValue,
  ).length;

  const notify = (message: string) => setFlash(message);

  const commitThreshold = () => {
    void saveSettings({
      ...settings,
      lowStockThreshold: thresholdValue,
    }).then((ok) =>
      notify(
        ok
          ? "Low-stock threshold saved — alerts use it immediately"
          : "Could not save — please try again",
      ),
    );
  };

  const commitLoyalty = () => {
    const target = Math.max(1, Math.min(50, Math.floor(Number(loyaltyTarget) || 10)));
    const minAmount = Math.max(0, Math.floor(Number(loyaltyMinAmount) || 0));

    void saveSettings({
      ...settings,
      loyaltyEnabled,
      loyaltyTargetOrders: target,
      loyaltyRewardTitle: loyaltyRewardTitle.trim() || "এক্সক্লুসিভ গিফট হ্যাম্পার",
      loyaltyRewardDescription: loyaltyRewardDesc.trim() || "",
      loyaltyMinOrderAmount: minAmount,
      rainSurchargeEnabled: rainEnabled,
      nightSurchargeEnabled: nightEnabled,
      expressDeliveryEnabled: expressEnabled,
      perZoneFreeThresholdEnabled: perZoneFreeEnabled,
    }).then((ok) =>
      notify(
        ok
          ? "লয়্যালটি ও রিওয়ার্ড সেটিংস সফলভাবে সংরক্ষিত হয়েছে"
          : "Could not save — please try again",
      ),
    );
  };

  const commitDeliverySurcharges = () => {
    void saveSettings({
      ...settings,
      rainSurchargeEnabled: rainEnabled,
      nightSurchargeEnabled: nightEnabled,
      expressDeliveryEnabled: expressEnabled,
      perZoneFreeThresholdEnabled: perZoneFreeEnabled,
    }).then((ok) => notify(ok ? "Delivery surcharge settings saved" : "Could not save"));
  };

  const resetAll = () => {
    if (
      !window.confirm(
        "Reset ALL demo data (orders, catalog, zones, reviews, coupons, notifications, homepage, media, messages, settings) to the seeded samples?",
      )
    )
      return;
    ordersApi.reset();
    catalogApi.reset();
    zonesApi.reset();
    reviewsApi.reset();
    couponsApi.reset();
    notifsApi.reset();
    cmsApi.reset();
    resetMediaStore();
    resetDemoMessages();
    setThreshold(String(settings.lowStockThreshold));
    setLoyaltyEnabled(settings.loyaltyEnabled);
    setLoyaltyTarget(String(settings.loyaltyTargetOrders));
    setLoyaltyRewardTitle(settings.loyaltyRewardTitle);
    setLoyaltyRewardDesc(settings.loyaltyRewardDescription);
    setLoyaltyMinAmount(String(settings.loyaltyMinOrderAmount));
    notify("All demo data reset to seeds");
  };

  const stores = [
    { key: "orders", name: "Orders", count: ordersApi.orders.length, reset: ordersApi.reset, hint: "12 seeded demo orders across statuses (§33–34)" },
    { key: "catalog", name: "Products & categories", count: catalogApi.products.length, reset: catalogApi.reset, hint: "Catalog used by the storefront + inventory (§5, §71)" },
    { key: "zones", name: "Delivery zones", count: zonesApi.zones.length, reset: zonesApi.reset, hint: "Zones and charges the checkout charges live (§20–21)" },
    { key: "reviews", name: "Reviews", count: reviewsApi.reviews.length, reset: reviewsApi.reset, hint: "Storefront reviews + moderation queue (§30)" },
    { key: "coupons", name: "Coupons", count: couponsApi.coupons.length, reset: couponsApi.reset, hint: "WELCOME100 · PROSANTI15 · EID50 + usage counts (§56)" },
    { key: "notifs", name: "Notifications", count: notifsApi.notifs.length, reset: notifsApi.reset, hint: "Inbox + bell unread state (§35)" },
    { key: "cms", name: "Homepage CMS", count: 0, reset: cmsApi.reset, hint: "Announcement, hero and homepage sections (§31)" },
    { key: "media", name: "Media additions", count: 0, reset: resetMediaStore, hint: "Custom URLs added in the media library (§49)" },
    { key: "messages", name: "Contact messages", count: 0, reset: resetDemoMessages, hint: "Demo inbox for the contact form" },
  ];

  const constants = [
    { k: "Currency", v: "Bangladeshi Taka — integer paisa end to end (§69)" },
    { k: "Order numbers", v: "PS-YYYYMMDD-NNNN, assigned at placement (§70)" },
    { k: "Payments", v: "Cash on delivery only — see the Payments page (§20–21)" },
    live
      ? { k: "Storage", v: "Supabase Postgres — every change here is live data" }
      : { k: "Demo storage", v: "this browser's localStorage under prosanti.* keys" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">Settings</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {live ? (
              <>
                Operational preferences — saved in{" "}
                <code className="rounded bg-ivory-100 px-1 py-0.5 text-xs">site_settings</code> (§44).
              </>
            ) : (
              <>
                Operational preferences of the demo platform. Demo data below
                lives in this browser only.
              </>
            )}
          </p>
        </div>
        {!live && (
          <button
            type="button"
            onClick={resetAll}
            className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-forest-950 hover:text-ivory-50"
          >
            Reset all demo data
          </button>
        )}
      </div>

      {flash && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200"
        >
          <IconCheck className="h-4 w-4" /> {flash}
        </p>
      )}

      {/* Operational */}
      <section aria-label="Operations" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <div className="flex items-center gap-2">
          <IconSettings className="h-5 w-5 text-gold-600" />
          <h3 className="font-display text-base font-medium text-forest-900">Operations</h3>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-4 rounded-xl bg-ivory-100/60 p-5 ring-1 ring-line">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-100 text-lg font-bold text-gold-600">
              !
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Low-stock alert threshold</p>
              <p className="text-xs text-ink-soft">
                {lowCount} product{lowCount === 1 ? "" : "s"} at or below it right now — drives the
                dashboard alert and the inventory page (§58)
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <label className="block">
              <span className={label}>Units</span>
              <input
                className={`${field} w-24`}
                type="number"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={commitThreshold}
              className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      {/* Loyalty Reward Program (§10-Order Reward Engine) */}
      <section aria-label="Loyalty Program" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconGift className="h-5 w-5 text-gold-600" />
            <div>
              <h3 className="font-display text-base font-medium text-forest-900">
                লয়্যালটি ও রিওয়ার্ড প্রোগ্রাম (১০-অর্ডার রিওয়ার্ড)
              </h3>
              <p className="text-xs text-ink-soft">
                কাস্টমার সফলভাবে নির্দিষ্ট সংখ্যক ডেলিভারি গ্রহণ করলে বিশেষ উপহার বা রিওয়ার্ড পাবেন।
              </p>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={loyaltyEnabled}
              onChange={(e) => setLoyaltyEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-line text-forest-800 focus:ring-forest-800"
            />
            <span className="text-sm font-semibold text-ink">
              {loyaltyEnabled ? "সক্রিয় (Active)" : "নিষ্ক্রিয় (Disabled)"}
            </span>
          </label>
        </div>

        <div className="mt-5 space-y-4 rounded-xl bg-ivory-100/60 p-5 ring-1 ring-line">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>টার্গেট ডেলিভারি সংখ্যা (টোকেন/স্ট্যাম্প)</span>
              <input
                className={`${field} w-full`}
                type="number"
                min="1"
                max="50"
                value={loyaltyTarget}
                onChange={(e) => setLoyaltyTarget(e.target.value)}
                placeholder="10"
              />
              <span className="mt-1 block text-xs text-ink-soft">
                সাধারণত ১০টি সফল ডেলিভারিতে ১টি পুরস্কার আনলক হয়।
              </span>
            </label>

            <label className="block">
              <span className={label}>নূন্যতম অর্ডার মূল্য (৳ - ঐচ্ছিক)</span>
              <input
                className={`${field} w-full`}
                type="number"
                min="0"
                value={loyaltyMinAmount}
                onChange={(e) => setLoyaltyMinAmount(e.target.value)}
                placeholder="0"
              />
              <span className="mt-1 block text-xs text-ink-soft">
                ০ দিলে যেকোনো অর্ডারে স্ট্যাম্প পাবে, যেমন ৳৫০০ দিলে সর্বনিম্ন ৳৫০০ অর্ডারে স্ট্যাম্প পাবে।
              </span>
            </label>
          </div>

          <label className="block">
            <span className={label}>আকর্ষণীয় পুরস্কারের নাম (Reward Title)</span>
            <input
              className={`${field} w-full`}
              type="text"
              maxLength={120}
              value={loyaltyRewardTitle}
              onChange={(e) => setLoyaltyRewardTitle(e.target.value)}
              placeholder="যেমন: এক্সক্লুসিভ গিফট হ্যাম্পার / ৳৫০০ গিফট ভাউচার"
            />
          </label>

          <label className="block">
            <span className={label}>পুরস্কারের বিবরণ ও নির্দেশনাবলী (Description)</span>
            <textarea
              rows={2}
              className={`${field} w-full`}
              maxLength={500}
              value={loyaltyRewardDesc}
              onChange={(e) => setLoyaltyRewardDesc(e.target.value)}
              placeholder="১০টি সফল ডেলিভারি সম্পন্ন করার জন্য অভিনন্দন! আপনার গিফট পরবর্তী অর্ডারের সাথে পৌঁছে দেওয়া হবে।"
            />
          </label>

          <div className="mt-6 rounded-xl bg-forest-900 p-4 text-ivory-100">
            <h4 className="text-sm font-semibold text-gold-300">🚚 Delivery Surcharges — Sunamganj Real</h4>
            <p className="mt-1 text-xs text-ivory-100/70">Cloudinary proof + map pin er por eita next feature. Night 9PM-6AM +৳20, Rain +৳15, Express +৳40, per-zone free threshold.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={nightEnabled} onChange={(e) => setNightEnabled(e.target.checked)} className="h-4 w-4" />
                Night Surcharge (9PM-6AM +৳20) {nightEnabled ? "ON" : "OFF"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rainEnabled} onChange={(e) => setRainEnabled(e.target.checked)} className="h-4 w-4" />
                Rain Surcharge (+৳15) {rainEnabled ? "ON - Bristy" : "OFF"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={expressEnabled} onChange={(e) => setExpressEnabled(e.target.checked)} className="h-4 w-4" />
                Express Delivery (+৳40) {expressEnabled ? "ON" : "OFF"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={perZoneFreeEnabled} onChange={(e) => setPerZoneFreeEnabled(e.target.checked)} className="h-4 w-4" />
                Per-Zone Free Threshold {perZoneFreeEnabled ? "ON (z1 600, z4 1500)" : "OFF (flat 1000)"}
              </label>
            </div>
            <button type="button" onClick={commitDeliverySurcharges} className="mt-3 rounded-xl bg-gold-400 px-4 py-2 text-xs font-semibold text-forest-900">Save Delivery Settings</button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={commitLoyalty}
              className="rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
            >
              সংরক্ষণ করুন (Save Reward Settings)
            </button>
          </div>
        </div>
      </section>

      {/* Demo data — demo mode only; live data is never reset */}
      {!live && (
      <section aria-label="Demo data" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-medium text-forest-900">Demo data</h3>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              Every domain below persists independently. Resetting restores the seeded sample — a
              storefront demo aid, replaced by Supabase rows in the backend phase.
            </p>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {stores.map((s) => (
            <li key={s.key} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {s.name}
                  {s.count > 0 && (
                    <span className="ml-2 rounded-full bg-ivory-100 px-2 py-0.5 text-xs font-bold tabular-nums text-ink-soft">
                      {s.count}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-soft">{s.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Reset ${s.name} to the seeded sample data?`)) {
                    s.reset();
                    notify(`${s.name} reset to seeds`);
                  }
                }}
                className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-forest-950 hover:text-ivory-50"
              >
                Reset
              </button>
            </li>
          ))}
        </ul>
      </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform constants */}
        <section aria-label="Platform constants" className="rounded-2xl bg-paper p-6 ring-1 ring-line">
          <h3 className="font-display text-base font-medium text-forest-900">Platform constants</h3>
          <dl className="mt-4 space-y-3">
            {constants.map((c) => (
              <div key={c.k} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 text-sm last:border-0 last:pb-0">
                <dt className="shrink-0 font-semibold text-ink">{c.k}</dt>
                <dd className="text-right text-xs leading-5 text-ink-soft">{c.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Payments shortcut */}
        <section aria-label="Payments" className="flex flex-col justify-between rounded-2xl bg-forest-950 p-6 text-ivory-50 ring-1 ring-forest-900">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ivory-100/10 text-gold-300">
              <IconBanknote className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-medium">Cash on delivery</h3>
              <p className="mt-1 text-sm leading-6 text-ivory-100/70">
                Launch runs COD-only. Track the live COD book or browse the
                roadmap of online methods — they arrive with the gateway phase.
              </p>
            </div>
          </div>
          <Link
            href="/admin/payments"
            className="mt-5 inline-flex w-fit items-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-semibold text-forest-950 transition-colors hover:bg-gold-300"
          >
            Open Payments
          </Link>
        </section>
      </div>
    </div>
  );
}
