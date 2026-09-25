"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconShield, IconTruck } from "@/components/ui/icons";

const VEHICLES = [
  { id: "bike", label: "মোটরসাইকেল (Motorbike)" },
  { id: "bicycle", label: "বাইসাইকেল (Bicycle)" },
  { id: "scooter", label: "স্কুটার (Scooter)" },
] as const;

/** Server-side English → Bangla the applicant can act on. */
const friendlyApplyError = (raw: string): string => {
  const msg = raw.toLowerCase();
  if (msg.includes("already a rider")) {
    return "এই অ্যাকাউন্ট already রাইডার — /rider পোর্টালে লগইন করুন।";
  }
  if (msg.includes("already has a rider application")) {
    return "এই ফোন/ইমেইলে already একটি আবেদন আছে — আমরা শিগগিরই যোগাযোগ করব।";
  }
  if (msg.includes("at least one delivery zone")) {
    return "কমপক্ষে একটি ডেলিভারি জোন সিলেক্ট করুন।";
  }
  if (msg.includes("not available") && msg.includes("zone")) {
    return "একটি জোন এখন available নেই — পেজ রিফ্রেশ করে আবার সিলেক্ট করুন।";
  }
  if (msg.includes("mobile number")) {
    return "সঠিক ১১-সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।";
  }
  if (msg.includes("valid email")) {
    return "সঠিক ইমেইল অ্যাড্রেস দিন — এটাই আপনার রাইডার লগইন হবে।";
  }
  if (msg.includes("too many")) {
    return "অনেকবার চেষ্টা করা হয়েছে — একটু পরে আবার চেষ্টা করুন।";
  }
  if (msg.includes("not open yet") || msg.includes("503") || msg.includes("unavailable")) {
    return "রাইডার আবেদন এখনো চালু হয়নি — কিছুক্ষণ পর আবার চেষ্টা করুন।";
  }
  return raw || "আবেদন জমা দেওয়া যায়নি। পুনরায় চেষ্টা করুন।";
};

export default function RiderApplyPage() {
  const { activeZones: zones, live: zonesLive, loading: zonesLoading } = useLiveZones();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicle, setVehicle] = useState<"bike" | "bicycle" | "scooter">("bike");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [linkedLogin, setLinkedLogin] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the signup handoff (?email=) — same email must own the
  // login AND the application or the rider can never sign in.
  useEffect(() => {
    try {
      const prefill = new URLSearchParams(window.location.search).get("email")?.trim() ?? "";
      if (prefill && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(prefill)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill
        setEmail(prefill);
      }
    } catch {
      /* no query — blank form */
    }
  }, []);

  const toggleZone = (id: string) => {
    setSelectedZones((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    const normalizedPhone = cleanPhone.startsWith("+88")
      ? cleanPhone.slice(3)
      : cleanPhone.startsWith("88")
        ? cleanPhone.slice(2)
        : cleanPhone;
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setError("আপনার পুরো নাম লিখুন।");
      return;
    }
    if (!/^01[0-9]{9}$/.test(normalizedPhone)) {
      setError("সঠিক ১১-সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("সঠিক ইমেইল অ্যাড্রেস দিন।");
      return;
    }
    if (selectedZones.length === 0) {
      setError("কমপক্ষে একটি ডেলিভারি জোন সিলেক্ট করুন (যে এলাকায় ডেলিভারি করবেন)।");
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
          phone: normalizedPhone,
          contactEmail: cleanEmail,
          vehicle,
          zoneIds: selectedZones,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        linked?: boolean;
      } | null;
      if (!res.ok) {
        throw new Error(friendlyApplyError(data?.error ?? ""));
      }

      setLinkedLogin(data?.linked === true);
      setSubmittedEmail(cleanEmail);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? friendlyApplyError(err.message) : "আবেদন প্রক্রিয়া ব্যর্থ হয়েছে।");
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
          রাইডার আবেদন গৃহীত হয়েছে!
        </h1>
        {linkedLogin ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            ধন্যবাদ <strong>{name}</strong>! আপনার লগইনের সাথে আবেদনটি যুক্ত হয়েছে।
            তথ্য যাচাই করে অ্যাডমিন অনুমোদন করলেই <strong>/rider</strong> পোর্টাল থেকে
            ট্রিপ একসেপ্ট ও আয় শুরু করতে পারবেন।
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
            <p>
              ধন্যবাদ <strong>{name}</strong>! আবেদনটি পেন্ডিং কিউতে জমা হয়েছে।
            </p>
            <p className="mx-auto max-w-md rounded-2xl bg-gold-100/60 p-4 text-xs font-semibold text-forest-900 ring-1 ring-gold-300">
              পরের ধাপ (জরুরি): <strong>{submittedEmail || "আবেদনের ইমেইল"}</strong> দিয়ে{" "}
              <Link
                href={`/rider/login?signup=1&email=${encodeURIComponent(submittedEmail)}`}
                className="underline"
              >
                রাইডার অ্যাকাউন্ট খুলুন
              </Link>{" "}
              — একই ইমেইলে লগইন করলেই আবেদনটি আপনার অ্যাকাউন্টের সাথে যুক্ত হবে,
              তারপর অ্যাডমিন অনুমোদন দিলে ড্যাশবোর্ড খুলবে।
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {linkedLogin ? (
            <Link
              href="/rider"
              className="rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
            >
              রাইডার পোর্টালে যান →
            </Link>
          ) : (
            <Link
              href={`/rider/login?signup=1&email=${encodeURIComponent(submittedEmail)}`}
              className="rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
            >
              অ্যাকাউন্ট খুলুন →
            </Link>
          )}
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
          নিজের সুবিধাজনক সময়ে পোশাকের ইনস্ট্যান্ট ডেলিভারি সম্পন্ন করুন এবং আকর্ষণীয় আয় করুন।
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
              autoComplete="name"
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
              autoComplete="tel-national"
              inputMode="tel"
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
              autoComplete="email"
            />
            <span className={hint}>
              এই ইমেইলেই রাইডার লগইন হবে — অ্যাকাউন্ট খোলার সময় একই ইমেইল ব্যবহার করুন।
            </span>
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
              আপনার নিজস্ব বাহন সিলেক্ট করুন যা দিয়ে ডেলিভারি করবেন।
            </span>
          </label>
        </div>

        {/* Preferred Delivery Zones */}
        <div>
          <span className={label}>কাজের পছন্দের এলাকা / জোন *</span>
          {zonesLoading ? (
            <p className="mt-2 text-xs text-ink-soft">জোন লোড হচ্ছে…</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Delivery zones">
                {zones.map((z) => {
                  const checked = selectedZones.includes(z.id);
                  return (
                    <button
                      type="button"
                      key={z.id}
                      onClick={() => toggleZone(z.id)}
                      aria-pressed={checked}
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
              {!zonesLive && (
                <p className="mt-2 text-[11px] text-amber-800">
                  লাইভ জোন তালিকা লোড হয়নি — নিচের তালিকা থেকে বেছে নিন, সমস্যা হলে পেজ রিফ্রেশ করুন।
                </p>
              )}
              <p className="mt-1 text-[11px] text-ink-soft">
                {selectedZones.length === 0
                  ? "কমপক্ষে ১টি জোন সিলেক্ট করুন (একাধিকও পারবেন)।"
                  : `${selectedZones.length}টি জোন সিলেক্ট হয়েছে।`}
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl bg-ivory-100/70 p-4 ring-1 ring-line text-xs leading-relaxed text-ink-soft flex items-start gap-2.5">
          <IconShield className="h-5 w-5 shrink-0 text-gold-600 mt-0.5" />
          <p>
            আবেদনের পর অ্যাডমিন আপনার তথ্য ভেরিফাই করে অনুমোদন দেবে। লগইন ইমেইল
            + পাসওয়ার্ড দিয়ে — আবেদনের ইমেইল আর লগইনের ইমেইল <strong>একই</strong> হতে হবে।
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
