"use client";

/**
 * Rider application = rider sign-up (2026-09-26).
 *
 * One form collects the rider details AND the login (email + password).
 * The server creates the account with the pending rider row, so there is
 * no second "create account" step: once the admin approves, the same email
 * and password open /rider.
 */

import { useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconShield, IconTruck } from "@/components/ui/icons";
import { APPLICANT_PASSWORD_MIN, passwordProblem } from "@/lib/applicant-password";
import PasswordInput from "@/components/ui/password-input";
import {
  AlreadyAppliedLink,
  ApplySteps,
  FormAlert,
  FormSection,
  ZoneChips,
} from "@/components/apply/apply-form-ui";

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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [vehicle, setVehicle] = useState<"bike" | "bicycle" | "scooter">("bike");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "existing" → the email already had a PROSANTI login and it was reused. */
  const [account, setAccount] = useState<"created" | "existing">("created");

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
    const passwordIssue = passwordProblem(password, confirmPassword);
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    if (selectedZones.length === 0) {
      setError("অন্তত একটি কাজের এলাকা / জোন সিলেক্ট করুন।");
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
          password,
          vehicle,
          zoneIds: selectedZones,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        account?: "created" | "existing";
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "আবেদন জমা দেওয়া যায়নি। পুনরায় চেষ্টা করুন।");
      }

      setAccount(data?.account === "existing" ? "existing" : "created");
      setPassword("");
      setConfirmPassword("");
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

        <div
          role="status"
          className="mx-auto mt-6 max-w-md rounded-2xl bg-gold-100/70 p-4 text-left ring-1 ring-gold-300"
        >
          <p className="text-xs font-semibold text-forest-900">
            আপনার রাইডার লগইন তৈরি হয়ে গেছে
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {account === "existing"
              ? "এই ইমেইলে আগে থেকেই PROSANTI অ্যাকাউন্ট ছিল — সেটিই আপনার রাইডার প্রোফাইলের সাথে যুক্ত করা হয়েছে। "
              : ""}
            অ্যাডমিন অনুমোদন করার পর <strong>{email}</strong> এবং আবেদনের সময় দেওয়া পাসওয়ার্ড দিয়ে <strong>/rider/login</strong>-এ সাইন ইন করলেই রাইডার অ্যাপ খুলবে। অনুমোদনের আগে লগইন করলে “অনুমোদনের অপেক্ষায়” বার্তা দেখাবে — এটাই স্বাভাবিক।
          </p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/rider/login"
            className="inline-flex min-h-11 items-center rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            রাইডার লগইন পেইজ →
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-6 py-2.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100"
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

      <ApplySteps kind="rider" />

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-3xl border border-line bg-paper p-6 shadow-sm sm:p-8"
      >
        <FormAlert message={error} />

        <FormSection step={1} title="আপনার তথ্য">
          <label className="block sm:col-span-2">
            <span className={label}>আপনার পুরো নাম (Full Name) *</span>
            <input
              required
              autoComplete="name"
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
              inputMode="numeric"
              autoComplete="tel-national"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="017XXXXXXXX"
            />
            <span className={hint}>দোকান ও কাস্টমার এই নম্বরে কল করবেন; পেমেন্টও এখানেই।</span>
          </label>

          <label className="block">
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
            <span className={hint}>যে বাহনে ডেলিভারি করবেন, সেটি বেছে নিন।</span>
          </label>
        </FormSection>

        <FormSection
          step={2}
          title="লগইন তথ্য"
          hint="অনুমোদনের পর এই ইমেইল ও পাসওয়ার্ড দিয়েই রাইডার অ্যাপে ঢুকবেন — মনে রাখার মতো পাসওয়ার্ড দিন।"
        >
          <label className="block sm:col-span-2">
            <span className={label}>লগইন ইমেইল অ্যাড্রেস *</span>
            <input
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rider@example.com"
            />
          </label>

          <label className="block">
            <span className={label}>লগইন পাসওয়ার্ড *</span>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={APPLICANT_PASSWORD_MIN}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="অন্তত ৬ অক্ষর"
              toggle={{ show: "দেখুন", hide: "লুকান" }}
            />
          </label>

          <label className="block">
            <span className={label}>পাসওয়ার্ড আবার লিখুন *</span>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={APPLICANT_PASSWORD_MIN}
              className={field}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="একই পাসওয়ার্ড"
              toggle={{ show: "দেখুন", hide: "লুকান" }}
            />
          </label>
        </FormSection>

        <FormSection
          step={3}
          title="কাজের এলাকা"
          hint="যেসব এলাকায় ট্রিপ নিতে চান, অন্তত একটি বেছে নিন — পরে অ্যাডমিন বাড়াতে বা কমাতে পারবেন।"
        >
          <ZoneChips zones={zones} selected={selectedZones} onToggle={toggleZone} />
        </FormSection>

        <div className="flex items-start gap-2.5 rounded-2xl bg-ivory-100/70 p-4 text-xs leading-relaxed text-ink-soft ring-1 ring-line">
          <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
          <p>
            আবেদন জমা দিলেই আপনার রাইডার লগইন (উপরের ইমেইল ও পাসওয়ার্ড) তৈরি হয়ে যায়। অ্যাডমিন তথ্য ভেরিফাই করে অনুমোদন দিলে সেই লগইনেই /rider অ্যাপ খুলবে — অনুমোদনের আগে সাইন ইন করলে “অনুমোদনের অপেক্ষায়” বার্তা দেখাবে।
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? "জমা হচ্ছে…" : "আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন"}
        </button>

        <AlreadyAppliedLink href="/rider/login" />
      </form>
    </div>
  );
}
