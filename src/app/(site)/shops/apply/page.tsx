"use client";

import { useState } from "react";
import Link from "next/link";
import { useZones } from "@/lib/use-zones";
import { useShops } from "@/lib/use-shops";
import { isSupabaseConfigured } from "@/lib/env";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconShield, IconTruck } from "@/components/ui/icons";

export default function ShopApplyPage() {
  const { zones } = useZones();
  const { saveShop } = useShops();
  // Public intake uses the backend whenever Supabase is configured; staff
  // sessions are irrelevant to an applicant and must not force demo mode.
  const live = isSupabaseConfigured();

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("15");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleZone = (id: string) => {
    setSelectedZones((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setError("দোকানের নাম অন্তত ২ অক্ষরের হতে হবে।");
      return;
    }
    if (!/^(\+?88)?01[0-9]{9}$/.test(cleanPhone)) {
      setError("সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("সঠিক ইমেইল অ্যাড্রেস দিন।");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (live) {
        const res = await fetch("/api/shops/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cleanName,
            tagline: tagline.trim(),
            phone: cleanPhone,
            contactEmail: cleanEmail,
            address: address.trim(),
            prepMinutes: Math.max(5, Math.floor(Number(prepMinutes) || 15)),
            zoneIds: selectedZones,
          }),
        });

        const data = (await res.json().catch(() => null)) as {
          demoMode?: boolean;
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error ?? "আবেদন জমা দেওয়া যায়নি। পুনরায় চেষ্টা করুন।");
        }
        // Public keys configured but service role missing: the API answered
        // demoMode, so keep the local demo queue instead of confirming a
        // backend write that never happened.
        if (data?.demoMode) {
          await saveShop({
            id: `shop-demo-${Date.now()}`,
            name: cleanName,
            slug: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            tagline: tagline.trim() || "Local Clothing Shop",
            phone: cleanPhone,
            contactEmail: cleanEmail,
            address: address.trim(),
            zoneIds: selectedZones.length > 0 ? selectedZones : zones.map((z) => z.id),
            prepMinutes: Math.max(5, Math.floor(Number(prepMinutes) || 15)),
            commissionPct: 15,
            status: "pending",
            isOpen: false,
            ratingAvg: 0,
            ratingCount: 0,
          });
        }
      } else {
        // Demo Mode: save into browser demo store with 'pending' status
        await saveShop({
          id: `shop-demo-${Date.now()}`,
          name: cleanName,
          slug: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          tagline: tagline.trim() || "Local Clothing Shop",
          phone: cleanPhone,
          contactEmail: cleanEmail,
          address: address.trim(),
          zoneIds: selectedZones.length > 0 ? selectedZones : zones.map((z) => z.id),
          prepMinutes: Math.max(5, Math.floor(Number(prepMinutes) || 15)),
          commissionPct: 15,
          status: "pending",
          isOpen: false,
          ratingAvg: 0,
          ratingCount: 0,
        });
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "আবেদন প্রক্রিয়া ব্যর্থ হয়েছে।");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <IconCheck className="h-8 w-8 stroke-[2.5]" />
        </div>
        <h1 className="font-display mt-6 text-2xl font-bold text-forest-900 sm:text-3xl">
          আবেদন সফলভাবে গৃহীত হয়েছে!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          ধন্যবাদ <strong>{name}</strong>! আপনার শপ রেজিস্ট্রেশন আবেদন আমাদের পেন্ডিং কিউতে জমা হয়েছে। আমাদের টিম খুব দ্রুত তথ্য যাচাই করে অ্যাকাউন্ট অনুমোদন (Approve) করবে।
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/shops"
            className="rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            শপ ডিরেক্টরি দেখুন →
          </Link>
          <Link
            href="/"
            className="rounded-full border border-line bg-paper px-6 py-2.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100"
          >
            হোমে ফিরে যান
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800">
          <IconTruck className="h-3.5 w-3.5 text-gold-600" /> PROSANTI পার্টনার
        </span>
        <h1 className="font-display mt-3 text-3xl font-bold text-forest-900 sm:text-4xl">
          দোকানদার হিসেবে যুক্ত হোন
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          আপনার কাপড়ের দোকান অনলাইন করুন এবং ৪৫-৬০ মিনিটে কাস্টমারদের কাছে ইনস্ট্যান্ট ডেলিভারি পৌঁছে দিন।
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-3xl border border-line bg-paper p-6 sm:p-8 shadow-sm space-y-5"
      >
        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-800 ring-1 ring-rose-200"
          >
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>দোকানের নাম (Shop Name) *</span>
            <input
              required
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="যেমন: আরিয়ান ফ্যাশন / ঐতিহ্য ক্লথিং"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>ট্যাগলাইন বা পরিচিতি (ঐচ্ছিক)</span>
            <input
              className={field}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="যেমন: প্রিমিয়াম পাঞ্জাবি ও এক্সক্লুসিভ শাড়ি"
            />
          </label>

          <label className="block">
            <span className={label}>মোবাইল নম্বর *</span>
            <input
              required
              type="tel"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="017XXXXXXXX"
            />
          </label>

          <label className="block">
            <span className={label}>লগইন / যোগাযোগ ইমেইল *</span>
            <input
              required
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="shop@example.com"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>দোকানের পূর্ণ ঠিকানা *</span>
            <textarea
              required
              rows={2}
              className={field}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="যেমন: কান্দিরপাড় মার্কেট, ২য় তলা, কুমিল্লা"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>আনুমানিক প্যাকিং সময় (মিনিট)</span>
            <input
              type="number"
              min="5"
              max="45"
              className={field}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              placeholder="15"
            />
            <span className={hint}>
              অর্ডার আসার পর রাইডার আসার আগে কত মিনিটে কাপড় প্যাক করে দিতে পারবেন।
            </span>
          </label>
        </div>

        {/* Zones selection */}
        <div>
          <span className={label}>যেসব জোনে ডেলিভারি দিতে চান</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {zones.map((z) => {
              const checked = selectedZones.includes(z.id);
              return (
                <button
                  type="button"
                  key={z.id}
                  onClick={() => toggleZone(z.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                    checked
                      ? "bg-forest-800 text-ivory-50 ring-1 ring-forest-800"
                      : "bg-ivory-100 text-ink-soft ring-1 ring-line hover:border-line-strong"
                  }`}
                >
                  {checked ? `✓ ${z.name}` : z.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            (সিলেক্ট না করলে সব জোনে সার্ভিস প্রযোজ্য হবে)
          </p>
        </div>

        <div className="rounded-2xl bg-ivory-100/70 p-4 ring-1 ring-line text-xs leading-relaxed text-ink-soft flex items-start gap-2.5">
          <IconShield className="h-5 w-5 shrink-0 text-gold-600 mt-0.5" />
          <p>
            আবেদন জমা দিলে অ্যাডমিন প্যানেল থেকে তথ্য যাচাই করে আপনার শপ অ্যাকাউন্ট অ্যাক্টিভ করা হবে। আপনি ভেন্ডর প্যানেলে লগইন করে প্রোডাক্ট আপলোড করতে পারবেন।
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-full bg-forest-800 font-semibold text-xs text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? "জমা হচ্ছে…" : "আবেদন জমা দিন (Submit Shop Application)"}
        </button>
      </form>
    </div>
  );
}
