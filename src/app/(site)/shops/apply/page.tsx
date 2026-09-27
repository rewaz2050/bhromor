"use client";

/**
 * Shop application = vendor sign-up (2026-09-26).
 *
 * One form collects the shop details AND the login (email + password).
 * The server creates the account with the pending shop, so there is no
 * second "create account" step: once PROSANTI approves, the same email and
 * password open /vendor.
 */

import { useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconShield, IconTruck } from "@/components/ui/icons";
import { APPLICANT_PASSWORD_MIN, passwordProblem } from "@/lib/applicant-password";
import { isPlausibleBdPhone, tidyPhoneInput } from "@/lib/phone";
import PasswordInput from "@/components/ui/password-input";
import {
  AlreadyAppliedLink,
  ApplySteps,
  FormAlert,
  FormSection,
  ZoneChips,
} from "@/components/apply/apply-form-ui";

export default function ShopApplyPage() {
  const { activeZones: zones } = useLiveZones();

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("15");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  /** 2026-09-27 — the commission/settlement terms must be seen, not assumed. */
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What to type in the login box later — the e-mail, or the mobile number for a phone login. */
  const [loginHandle, setLoginHandle] = useState("");
  /** Round 4 — this application replaced a rejected one (same login). */
  const [resubmitted, setResubmitted] = useState(false);
  /** "existing" → the email already had a PROSANTI login and it was reused. */
  const [account, setAccount] = useState<"created" | "existing">("created");
  /** The number staff will call/WhatsApp — echoed back on the success card. */
  const [submittedPhone, setSubmittedPhone] = useState("");

  const toggleZone = (id: string) => {
    setSelectedZones((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    // +88 / 88 / Bangla digits / spaces all collapse to 01XXXXXXXXX — the
    // server normalises the same way, so the two can never disagree again.
    const cleanPhone = tidyPhoneInput(phone);
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      setError("দোকানের নাম অন্তত ২ অক্ষরের হতে হবে।");
      return;
    }
    if (!isPlausibleBdPhone(cleanPhone)) {
      setError("সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
      return;
    }
    // Round 4 — e-mail is optional: without one the mobile number is the login.
    if (cleanEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("ইমেইলটি ঠিক নেই — ঠিক করুন, অথবা ফাঁকা রাখুন (তখন মোবাইল নম্বর দিয়েই লগইন হবে)।");
      return;
    }
    const passwordIssue = passwordProblem(password, confirmPassword);
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    if (selectedZones.length === 0) {
      setError("অন্তত একটি ডেলিভারি এলাকা সিলেক্ট করুন।");
      return;
    }
    if (!agreedTerms) {
      setError("শর্তাবলীতে টিক দিয়ে সম্মতি দিন — কমিশন ও পেআউট কীভাবে কাজ করে সেখানে লেখা আছে।");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/shops/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          tagline: tagline.trim(),
          phone: cleanPhone,
          contactEmail: cleanEmail,
          password,
          address: address.trim(),
          prepMinutes: Math.max(5, Math.floor(Number(prepMinutes) || 15)),
          zoneIds: selectedZones,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        account?: "created" | "existing";
        login?: string;
        resubmitted?: boolean;
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "আবেদন জমা দেওয়া যায়নি। পুনরায় চেষ্টা করুন।");
      }

      setAccount(data?.account === "existing" ? "existing" : "created");
      setLoginHandle(data?.login || cleanEmail || cleanPhone);
      setSubmittedPhone(cleanPhone);
      setResubmitted(data?.resubmitted === true);
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
          {resubmitted ? "আবেদন আবার জমা হয়েছে!" : "আবেদন সফলভাবে গৃহীত হয়েছে!"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          ধন্যবাদ <strong>{name}</strong>!{" "}
          {resubmitted
            ? "নতুন তথ্যসহ আপনার শপ রেজিস্ট্রেশন আবেদন আবার অ্যাডমিনের কিউতে গেছে।"
            : "আপনার শপ রেজিস্ট্রেশন আবেদন আমাদের পেন্ডিং কিউতে জমা হয়েছে।"}{" "}
          আমাদের টিম খুব দ্রুত তথ্য যাচাই করে অ্যাকাউন্ট অনুমোদন (Approve) করবে।
        </p>

        <div
          role="status"
          className="mx-auto mt-6 max-w-md rounded-2xl bg-gold-100/70 p-4 text-left ring-1 ring-gold-300"
        >
          <p className="text-xs font-semibold text-forest-900">
            আপনার ভেন্ডর লগইন তৈরি হয়ে গেছে
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {account === "existing"
              ? "এই ইমেইলে আগে থেকেই PROSANTI অ্যাকাউন্ট ছিল — সেটিই আপনার দোকানের সাথে যুক্ত করা হয়েছে। "
              : ""}
            অ্যাডমিন অনুমোদন করার পর <strong>{loginHandle}</strong> এবং আবেদনের সময় দেওয়া পাসওয়ার্ড দিয়ে <strong>/vendor/login</strong>-এ সাইন ইন করলেই ড্যাশবোর্ড খুলবে। অনুমোদনের আগে লগইন করলে “অনুমোদনের অপেক্ষায়” বার্তা দেখাবে — এটাই স্বাভাবিক।
          </p>
        </div>

        <div className="mx-auto mt-4 max-w-md rounded-2xl bg-paper p-4 text-left ring-1 ring-line" data-testid="after-apply">
          <p className="text-xs font-semibold text-forest-900">এরপর কী হবে</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-soft">
            <li>১. আমাদের টিম তথ্য যাচাই করে সাধারণত একই দিনে অনুমোদন দেয়।</li>
            <li>
              ২. অনুমোদনের খবর আপনার মোবাইলে ({submittedPhone || phone}) WhatsApp/ফোনে
              দেওয়া হবে — ফোনটা হাতের কাছে রাখুন।
            </li>
            <li>৩. তারপর লগইন করে প্রোডাক্ট তুলুন — ছবি, দাম, স্টক দিলেই দোকান লাইভ।</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/vendor/login"
            className="inline-flex min-h-11 items-center rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            ভেন্ডর লগইন পেইজ →
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
          <IconTruck className="h-3.5 w-3.5 text-gold-600" /> PROSANTI পার্টনার
        </span>
        <h1 className="font-display mt-3 text-3xl font-bold text-forest-900 sm:text-4xl">
          দোকানদার হিসেবে যুক্ত হোন
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          আপনার কাপড়ের দোকান অনলাইন করুন এবং ৪৫-৬০ মিনিটে কাস্টমারদের কাছে ইনস্ট্যান্ট ডেলিভারি পৌঁছে দিন।
        </p>
      </div>

      <ApplySteps kind="vendor" />

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-3xl border border-line bg-paper p-6 shadow-sm sm:p-8"
      >
        <FormAlert message={error} />

        <FormSection step={1} title="দোকানের তথ্য">
          <label className="block sm:col-span-2">
            <span className={label}>দোকানের নাম (Shop Name) *</span>
            <input
              required
              autoComplete="organization"
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
              inputMode="numeric"
              autoComplete="tel-national"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="017XXXXXXXX"
            />
            <span className={hint}>রাইডার পিকআপের সময় এই নম্বরে কল করবেন; WhatsApp থাকলে ভালো।</span>
          </label>

          <label className="block">
            <span className={label}>আনুমানিক প্যাকিং সময় (মিনিট)</span>
            <input
              type="number"
              inputMode="numeric"
              min="5"
              max="240"
              className={field}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              placeholder="15"
            />
            <span className={hint}>
              অর্ডার আসার পর রাইডার পৌঁছানোর আগে কত মিনিটে প্যাক করতে পারবেন
              (৫–২৪০; বেশিরভাগ দোকানের জন্য ১৫–৩০ ঠিকঠাক)। পরে সেটিংসে বদলানো যাবে।
            </span>
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>দোকানের পূর্ণ ঠিকানা *</span>
            <textarea
              required
              rows={2}
              autoComplete="street-address"
              className={field}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="যেমন: কান্দিরপাড় মার্কেট, ২য় তলা, কুমিল্লা"
            />
          </label>
        </FormSection>

        <FormSection
          step={2}
          title="লগইন তথ্য"
          hint="অনুমোদনের পর মোবাইল নম্বর (বা ইমেইল) ও এই পাসওয়ার্ড দিয়েই ভেন্ডর ড্যাশবোর্ডে ঢুকবেন — মনে রাখার মতো পাসওয়ার্ড দিন।"
        >
          <label className="block sm:col-span-2">
            <span className={label}>ইমেইল অ্যাড্রেস (ঐচ্ছিক)</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="shop@example.com"
            />
            <span className={hint}>ইমেইল না থাকলে ফাঁকা রাখুন — দোকানের মোবাইল নম্বর দিয়েই লগইন করবেন। কোনো এসএমএস বা ইমেইল পাঠানো হয় না।</span>
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
          title="ডেলিভারি এলাকা"
          hint="যেসব এলাকায় ডেলিভারি দিতে চান, অন্তত একটি বেছে নিন — পরে অ্যাডমিন বাড়াতে বা কমাতে পারবেন।"
        >
          <ZoneChips zones={zones} selected={selectedZones} onToggle={toggleZone} />
        </FormSection>

        {/* 2026-09-27 — the terms a seller actually needs before signing up:
            commission, settlement and returns were nowhere on this page. */}
        <div className="rounded-2xl bg-ivory-100/70 p-4 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-900">
            যে শর্তে PROSANTI-তে বিক্রি হবে
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-soft">
            <li>
              • প্রতি অর্ডারে <strong>PROSANTI কমিশন</strong> (সাধারণত ১৫%, চূড়ান্ত
              হার অনুমোদনের সময় আপনার সাথে ঠিক করা হয়) কেটে বাকিটা আপনার।
            </li>
            <li>
              • ডেলিভারি চার্জ কাস্টমার দেয়; ডেলিভারি হয় PROSANTI-র রাইডার/কুরিয়ারে —
              আপনার দরকার শুধু অর্ডার প্যাক করে দেওয়া।
            </li>
            <li>
              • বিক্রির টাকা <strong>সেটেলমেন্ট (পেআউট)</strong> চক্রে bKash/ব্যাংকে
              দেওয়া হয়; ভারী-হালকা হিসাব ড্যাশবোর্ডের আর্নিংস পেজে সবসময় দেখা যাবে।
            </li>
            <li>
              • ভুল/নষ্ট পণ্য, বাতিল ও রিটার্ন PROSANTI নীতিমালা অনুযায়ী — কাস্টমার
              রাইডারের সামনেই চেক করে নেয়, ডেলিভারি প্রুফ ড্যাশবোর্ডে থাকে।
            </li>
          </ul>
          <label className="mt-3 flex items-start gap-2.5 text-xs font-medium text-forest-900">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-forest-700"
              aria-label="শর্তাবলীতে সম্মত"
            />
            <span>
              আমি উপরের কমিশন, সেটেলমেন্ট ও ডেলিভারি/রিটার্ন নীতিতে সম্মত আছি।
            </span>
          </label>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl bg-ivory-100/70 p-4 text-xs leading-relaxed text-ink-soft ring-1 ring-line">
          <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
          <p>
            আবেদন জমা দিলেই আপনার ভেন্ডর লগইন (উপরের ইমেইল ও পাসওয়ার্ড) তৈরি হয়ে যায়। অ্যাডমিন তথ্য যাচাই করে অনুমোদন দিলে সেই লগইনেই ড্যাশবোর্ড খুলবে — তখন প্রোডাক্ট আপলোড, অর্ডার ও আয় সব এক জায়গায়। অনুমোদনের আগে সাইন ইন করলে “অনুমোদনের অপেক্ষায়” বার্তা দেখাবে।
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? "জমা হচ্ছে…" : "আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন"}
        </button>

        <AlreadyAppliedLink href="/vendor/login" />
      </form>
    </div>
  );
}
