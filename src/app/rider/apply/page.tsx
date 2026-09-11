"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconShield, IconTruck } from "@/components/ui/icons";

const VEHICLES = [
  { id: "bike", label: "মোটরসাইকেল (Motorbike)" },
  { id: "bicycle", label: "বাইসাইকেল (Bicycle)" },
  { id: "scooter", label: "স্কুটার (Scooter)" },
] as const;

export default function RiderApplyPage() {
  const { activeZones: zones } = useLiveZones();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicle, setVehicle] = useState<"bike" | "bicycle" | "scooter">("bike");
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
      setError("আপনার পুরো নাম লিখুন।");
      return;
    }
    if (!/^(\+?88)?01[0-9]{9}$/.test(cleanPhone)) {
      setError("সঠিক ১১-সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("সঠিক ইমেইল অ্যাড্রেস দিন।");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/riders/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          contactEmail: cleanEmail,
          vehicle,
          zoneIds: selectedZones,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "আবেদন জমা দেওয়া যায়নি। পুনরায় চেষ্টা করুন।");
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
          রাইডার আবেদন গৃহীত হয়েছে!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          ধন্যবাদ <strong>{name}</strong>! আপনার আবেদনটি আমাদের পেন্ডিং কিউতে জমা হয়েছে। তথ্য যাচাই করে অ্যাডমিন অনুমোদন করলেই আপনি <strong>/rider</strong> পোর্টাল থেকে ট্রিপ একসেপ্ট ও আয় শুরু করতে পারবেন।
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/rider"
            className="rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            রাইডার পোর্টালে যান →
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
          <IconTruck className="h-3.5 w-3.5 text-gold-600" /> PROSANTI ডেলিভারি টিম
        </span>
        <h1 className="font-display mt-3 text-3xl font-bold text-forest-900 sm:text-4xl">
          রাইডার হিসেবে যোগ দিন
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          নিজের সুবিধাজনক সময়ে পোশাকের ইনস্ট্যান্ট ডেলিভারি সম্পন্ন করুন এবং আকর্ষণীয় আয় করুন।
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
            <span className={label}>আপনার পুরো নাম (Full Name) *</span>
            <input
              required
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="যেমন: তানভীর আহমেদ"
            />
          </label>

          <label className="block">
            <span className={label}>মোবাইল নম্বর (বিকাশ/কল) *</span>
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
            <span className={label}>লগইন ইমেইল অ্যাড্রেস *</span>
            <input
              required
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rider@example.com"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>বাহনের ধরন (Vehicle) *</span>
            <select
              className={field}
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as "bike" | "bicycle" | "scooter")}
            >
              {VEHICLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <span className={hint}>
              আপনার নিজস্ব বাহন সিলেক্ট করুন যা দিয়ে ডেলিভারি করবেন।
            </span>
          </label>
        </div>

        {/* Preferred Delivery Zones */}
        <div>
          <span className={label}>কাজের পছন্দের এলাকা / জোন</span>
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
        </div>

        <div className="rounded-2xl bg-ivory-100/70 p-4 ring-1 ring-line text-xs leading-relaxed text-ink-soft flex items-start gap-2.5">
          <IconShield className="h-5 w-5 shrink-0 text-gold-600 mt-0.5" />
          <p>
            আবেদনের পর অ্যাডমিন আপনার তথ্য ভেরিফাই করে অনুমোদন দেবে। আপনার অ্যাকাউন্টে কোনো পাসওয়ার্ডের ঝামেলা নেই — সরাসরি ওটিপি/ইমেইল লগইন সাপোর্ট।
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-full bg-forest-800 font-semibold text-xs text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? "জমা হচ্ছে…" : "রাইডার আবেদন জমা দিন (Submit Rider Application)"}
        </button>
      </form>
    </div>
  );
}
