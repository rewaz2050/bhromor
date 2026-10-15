"use client";

/**
 * Shop application = vendor sign-up (2026-09-26).
 *
 * One form collects the shop details AND the login (email + password).
 * The server creates the account with the pending shop, so there is no
 * second "create account" step: once PROSANTI approves, the same email and
 * password open /vendor.
 *
 * Copy follows the storefront language (Bangla default). The policy terms
 * are a translation of the existing Bangla text and need owner review.
 */

import { useState } from "react";
import Link from "next/link";
import { useLiveZones } from "@/lib/use-live-zones";
import { field, hint, label } from "@/components/admin/form-ui";
import { useLanguage } from "@/components/i18n/language-provider";
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

const COPY = {
  bn: {
    nameErr: "দোকানের নাম অন্তত ২ অক্ষরের হতে হবে।",
    phoneErr: "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।",
    emailErr: "ইমেইলটি ঠিক নেই — ঠিক করুন, অথবা ফাঁকা রাখুন (তখন মোবাইল নম্বর দিয়েই লগইন হবে)।",
    zoneErr: "অন্তত একটি ডেলিভারি এলাকা সিলেক্ট করুন।",
    termsErr: "শর্তাবলীতে টিক দিয়ে সম্মতি দিন — কমিশন ও পেআউট কীভাবে কাজ করে সেখানে লেখা আছে।",
    submitFail: "আবেদন জমা দেওয়া যায়নি। পুনরায় চেষ্টা করুন।",
    failFallback: "আবেদন প্রক্রিয়া ব্যর্থ হয়েছে।",
    doneTitleNew: "আবেদন সফলভাবে গৃহীত হয়েছে!",
    doneTitleAgain: "আবেদন আবার জমা হয়েছে!",
    thanks: "ধন্যবাদ",
    bodyAgain: "নতুন তথ্যসহ আপনার শপ রেজিস্ট্রেশন আবেদন আবার অ্যাডমিনের কিউতে গেছে।",
    bodyNew: "আপনার শপ রেজিস্ট্রেশন আবেদন আমাদের পেন্ডিং কিউতে জমা হয়েছে।",
    teamBody: "আমাদের টিম খুব দ্রুত তথ্য যাচাই করে অ্যাকাউন্ট অনুমোদন (Approve) করবে।",
    loginTitle: "আপনার ভেন্ডর লগইন তৈরি হয়ে গেছে",
    existingNote: "এই ইমেইলে আগে থেকেই PROSANTI অ্যাকাউন্ট ছিল — সেটিই আপনার দোকানের সাথে যুক্ত করা হয়েছে। ",
    loginP1: "অ্যাডমিন অনুমোদন করার পর ",
    loginP2: " এবং আবেদনের সময় দেওয়া পাসওয়ার্ড দিয়ে ",
    loginP3: "-এ সাইন ইন করলেই ড্যাশবোর্ড খুলবে। অনুমোদনের আগে লগইন করলে “অনুমোদনের অপেক্ষায়” বার্তা দেখাবে — এটাই স্বাভাবিক।",
    nextTitle: "এরপর কী হবে",
    next1: "১. আমাদের টিম তথ্য যাচাই করে সাধারণত একই দিনে অনুমোদন দেয়।",
    next2a: "২. অনুমোদনের খবর আপনার মোবাইলে (",
    next2b: ") WhatsApp/ফোনে দেওয়া হবে — ফোনটা হাতের কাছে রাখুন।",
    next3: "৩. তারপর লগইন করে প্রোডাক্ট তুলুন — ছবি, দাম, স্টক দিলেই দোকান লাইভ।",
    vendorLogin: "ভেন্ডর লগইন পেইজ →",
    backHome: "হোমে ফিরে যান",
    partner: "PROSANTI পার্টনার",
    h1: "দোকানদার হিসেবে যুক্ত হোন",
    lead: "আপনার কাপড়ের দোকান অনলাইন করুন এবং ৪৫-৬০ মিনিটে কাস্টমারদের কাছে ইনস্ট্যান্ট ডেলিভারি পৌঁছে দিন।",
    s1: "দোকানের তথ্য",
    shopName: "দোকানের নাম (Shop Name) *",
    shopNamePh: "যেমন: আরিয়ান ফ্যাশন / ঐতিহ্য ক্লথিং",
    tagline: "ট্যাগলাইন বা পরিচিতি (ঐচ্ছিক)",
    taglinePh: "যেমন: প্রিমিয়াম পাঞ্জাবি ও এক্সক্লুসিভ শাড়ি",
    phone: "মোবাইল নম্বর *",
    phoneHint: "রাইডার পিকআপের সময় এই নম্বরে কল করবেন; WhatsApp থাকলে ভালো।",
    prep: "আনুমানিক প্যাকিং সময় (মিনিট)",
    prepHint: "অর্ডার আসার পর রাইডার পৌঁছানোর আগে কত মিনিটে প্যাক করতে পারবেন (৫–২৪০; বেশিরভাগ দোকানের জন্য ১৫–৩০ ঠিকঠাক)। পরে সেটিংসে বদলানো যাবে।",
    address: "দোকানের পূর্ণ ঠিকানা *",
    addressPh: "যেমন: কান্দিরপাড় মার্কেট, ২য় তলা, কুমিল্লা",
    s2: "লগইন তথ্য",
    s2Hint: "অনুমোদনের পর মোবাইল নম্বর (বা ইমেইল) ও এই পাসওয়ার্ড দিয়েই ভেন্ডর ড্যাশবোর্ডে ঢুকবেন — মনে রাখার মতো পাসওয়ার্ড দিন।",
    email: "ইমেইল অ্যাড্রেস (ঐচ্ছিক)",
    emailHint: "ইমেইল না থাকলে ফাঁকা রাখুন — দোকানের মোবাইল নম্বর দিয়েই লগইন করবেন। কোনো এসএমএস বা ইমেইল পাঠানো হয় না।",
    pw: "লগইন পাসওয়ার্ড *",
    pwPh: "অন্তত ৬ অক্ষর",
    pw2: "পাসওয়ার্ড আবার লিখুন *",
    pw2Ph: "একই পাসওয়ার্ড",
    show: "দেখুন",
    hide: "লুকান",
    s3: "ডেলিভারি এলাকা",
    s3Hint: "যেসব এলাকায় ডেলিভারি দিতে চান, অন্তত একটি বেছে নিন — পরে অ্যাডমিন বাড়াতে বা কমাতে পারবেন।",
    termsTitle: "যে শর্তে PROSANTI-তে বিক্রি হবে",
    term1a: "• প্রতি অর্ডারে ",
    term1b: "PROSANTI কমিশন",
    term1c: " (সাধারণত ১৫%, চূড়ান্ত হার অনুমোদনের সময় আপনার সাথে ঠিক করা হয়) কেটে বাকিটা আপনার।",
    term2: "• ডেলিভারি চার্জ কাস্টমার দেয়; ডেলিভারি হয় PROSANTI-র রাইডার/কুরিয়ারে — আপনার দরকার শুধু অর্ডার প্যাক করে দেওয়া।",
    term3a: "• বিক্রির টাকা ",
    term3b: "সেটেলমেন্ট (পেআউট)",
    term3c: " চক্রে bKash/ব্যাংকে দেওয়া হয়; ভারী-হালকা হিসাব ড্যাশবোর্ডের আর্নিংস পেজে সবসময় দেখা যাবে।",
    term4: "• ভুল/নষ্ট পণ্য, বাতিল ও রিটার্ন PROSANTI নীতিমালা অনুযায়ী — কাস্টমার রাইডারের সামনেই চেক করে নেয়, ডেলিভারি প্রুফ ড্যাশবোর্ডে থাকে।",
    termsAgreeAria: "শর্তাবলীতে সম্মত",
    termsAgree: "আমি উপরের কমিশন, সেটেলমেন্ট ও ডেলিভারি/রিটার্ন নীতিতে সম্মত আছি।",
    noteA: "আবেদন জমা দিলেই আপনার ভেন্ডর লগইন (উপরের ইমেইল ও পাসওয়ার্ড) তৈরি হয়ে যায়। অ্যাডমিন তথ্য যাচাই করে অনুমোদন দিলে সেই লগইনেই ড্যাশবোর্ড খুলবে — তখন প্রোডাক্ট আপলোড, অর্ডার ও আয় সব এক জায়গায়। অনুমোদনের আগে সাইন ইন করলে “অনুমোদনের অপেক্ষায়” বার্তা দেখাবে।",
    submitting: "জমা হচ্ছে…",
    submit: "আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন",
  },
  en: {
    nameErr: "The shop name must be at least 2 characters.",
    phoneErr: "Enter a valid Bangladeshi mobile number (e.g. 017XXXXXXXX).",
    emailErr: "The email doesn't look right — fix it, or leave it blank (then your mobile number is the login).",
    zoneErr: "Select at least one delivery area.",
    termsErr: "Tick the box to agree to the terms — they explain how commission and payouts work.",
    submitFail: "Could not submit the application. Please try again.",
    failFallback: "The application failed. Please try again.",
    doneTitleNew: "Application received!",
    doneTitleAgain: "Application resubmitted!",
    thanks: "Thank you",
    bodyAgain: "Your shop application with the new details has gone back into the admin queue.",
    bodyNew: "Your shop application has been added to our pending queue.",
    teamBody: "Our team will check the details quickly and approve your account.",
    loginTitle: "Your vendor login has been created",
    existingNote: "This email already had a PROSANTI account — it has been linked to your shop. ",
    loginP1: "After the admin approves, use ",
    loginP2: " and the password you set when applying to sign in at ",
    loginP3: " to open your dashboard. Signing in before approval shows a “waiting for approval” message — that's expected.",
    nextTitle: "What happens next",
    next1: "1. Our team checks the details and usually approves them the same day.",
    next2a: "2. We'll send the approval news to your mobile (",
    next2b: ") by WhatsApp or phone — keep the phone handy.",
    next3: "3. Then sign in and add your products — once you add photos, prices and stock, your shop goes live.",
    vendorLogin: "Vendor sign-in page →",
    backHome: "Back to home",
    partner: "PROSANTI partner",
    h1: "Join as a shop owner",
    lead: "Take your clothing shop online and deliver to customers in 45–60 minutes.",
    s1: "Shop details",
    shopName: "Shop name *",
    shopNamePh: "e.g. Arian Fashion / Oitijjho Clothing",
    tagline: "Tagline or short description (optional)",
    taglinePh: "e.g. Premium panjabi and exclusive saris",
    phone: "Mobile number *",
    phoneHint: "The rider will call this number at pickup; WhatsApp is a plus.",
    prep: "Typical packing time (minutes)",
    prepHint: "How many minutes you need to pack an order before a rider arrives (5–240; 15–30 suits most shops). You can change it later in settings.",
    address: "Full shop address *",
    addressPh: "e.g. Kandirpar Market, 2nd floor, Comilla",
    s2: "Login details",
    s2Hint: "After approval, sign in to the vendor dashboard with your mobile number (or email) and this password — choose one you'll remember.",
    email: "Email address (optional)",
    emailHint: "Leave blank if you don't have one — you'll sign in with the shop's mobile number. No SMS or email is sent.",
    pw: "Login password *",
    pwPh: "At least 6 characters",
    pw2: "Type the password again *",
    pw2Ph: "The same password",
    show: "Show",
    hide: "Hide",
    s3: "Delivery areas",
    s3Hint: "Pick at least one area you can deliver to — the admin can add or remove areas later.",
    termsTitle: "Terms for selling on PROSANTI",
    term1a: "• On each order, the ",
    term1b: "PROSANTI commission",
    term1c: " is deducted (usually 15%; the final rate is agreed with you at approval) and the rest is yours.",
    term2: "• The customer pays the delivery charge; delivery is done by PROSANTI riders or couriers — you only need to pack the order.",
    term3a: "• Sale proceeds are paid out to bKash or your bank in a ",
    term3b: "settlement (payout)",
    term3c: " cycle; the breakdown is always visible on the Earnings page of your dashboard.",
    term4: "• Damaged or wrong items, cancellations and returns follow PROSANTI policy — the customer checks the order in front of the rider, and the delivery proof stays on your dashboard.",
    termsAgreeAria: "Agree to the terms",
    termsAgree: "I agree to the commission, settlement and delivery/return policy above.",
    noteA: "Submitting the application creates your vendor login (the email and password above). When the admin approves it, that login opens the dashboard — products, orders and earnings all in one place. Signing in before approval shows a “waiting for approval” message.",
    submitting: "Submitting…",
    submit: "Submit application and create account",
  },
} as const;

export default function ShopApplyPage() {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const en = lang !== "bn";
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
      setError(c.nameErr);
      return;
    }
    if (!isPlausibleBdPhone(cleanPhone)) {
      setError(c.phoneErr);
      return;
    }
    // Round 4 — e-mail is optional: without one the mobile number is the login.
    if (cleanEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError(c.emailErr);
      return;
    }
    const passwordIssue = passwordProblem(password, confirmPassword, en ? "en" : "bn");
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    if (selectedZones.length === 0) {
      setError(c.zoneErr);
      return;
    }
    if (!agreedTerms) {
      setError(c.termsErr);
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
        // A server error text is passed through as the API returned it.
        throw new Error(data?.error ?? c.submitFail);
      }

      setAccount(data?.account === "existing" ? "existing" : "created");
      setLoginHandle(data?.login || cleanEmail || cleanPhone);
      setSubmittedPhone(cleanPhone);
      setResubmitted(data?.resubmitted === true);
      setPassword("");
      setConfirmPassword("");
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : c.failFallback);
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
          {resubmitted ? c.doneTitleAgain : c.doneTitleNew}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {en ? (
            <>{c.thanks}, <strong>{name}</strong>! </>
          ) : (
            <>{c.thanks} <strong>{name}</strong>! </>
          )}
          {resubmitted ? c.bodyAgain : c.bodyNew}{" "}
          {c.teamBody}
        </p>

        <div
          role="status"
          className="mx-auto mt-6 max-w-md rounded-2xl bg-gold-100/70 p-4 text-left ring-1 ring-gold-300"
        >
          <p className="text-xs font-semibold text-forest-900">
            {c.loginTitle}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {account === "existing" ? c.existingNote : ""}
            {c.loginP1}<strong>{loginHandle}</strong>{c.loginP2}<strong>/vendor/login</strong>{c.loginP3}
          </p>
        </div>

        <div className="mx-auto mt-4 max-w-md rounded-2xl bg-paper p-4 text-left ring-1 ring-line" data-testid="after-apply">
          <p className="text-xs font-semibold text-forest-900">{c.nextTitle}</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-soft">
            <li>{c.next1}</li>
            <li>
              {c.next2a}{submittedPhone || phone}{c.next2b}
            </li>
            <li>{c.next3}</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/vendor/login"
            className="inline-flex min-h-11 items-center rounded-full bg-forest-800 px-6 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            {c.vendorLogin}
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-6 py-2.5 text-xs font-semibold text-forest-900 hover:bg-ivory-100"
          >
            {c.backHome}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800">
          <IconTruck className="h-3.5 w-3.5 text-gold-600" /> {c.partner}
        </span>
        <h1 className="font-display mt-3 text-3xl font-bold text-forest-900 sm:text-4xl">
          {c.h1}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {c.lead}
        </p>
      </div>

      <ApplySteps kind="vendor" lang={en ? "en" : "bn"} />

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-3xl border border-line bg-paper p-6 shadow-sm sm:p-8"
      >
        <FormAlert message={error} />

        <FormSection step={1} title={c.s1} lang={en ? "en" : "bn"}>
          <label className="block sm:col-span-2">
            <span className={label}>{c.shopName}</span>
            <input
              required
              autoComplete="organization"
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.shopNamePh}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>{c.tagline}</span>
            <input
              className={field}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={c.taglinePh}
            />
          </label>

          <label className="block">
            <span className={label}>{c.phone}</span>
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
            <span className={hint}>{c.phoneHint}</span>
          </label>

          <label className="block">
            <span className={label}>{c.prep}</span>
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
              {c.prepHint}
            </span>
          </label>

          <label className="block sm:col-span-2">
            <span className={label}>{c.address}</span>
            <textarea
              required
              rows={2}
              autoComplete="street-address"
              className={field}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={c.addressPh}
            />
          </label>
        </FormSection>

        <FormSection
          step={2}
          title={c.s2}
          hint={c.s2Hint}
          lang={en ? "en" : "bn"}
        >
          <label className="block sm:col-span-2">
            <span className={label}>{c.email}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="shop@example.com"
            />
            <span className={hint}>{c.emailHint}</span>
          </label>

          <label className="block">
            <span className={label}>{c.pw}</span>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={APPLICANT_PASSWORD_MIN}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={c.pwPh}
              toggle={{ show: c.show, hide: c.hide }}
            />
          </label>

          <label className="block">
            <span className={label}>{c.pw2}</span>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={APPLICANT_PASSWORD_MIN}
              className={field}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={c.pw2Ph}
              toggle={{ show: c.show, hide: c.hide }}
            />
          </label>
        </FormSection>

        <FormSection
          step={3}
          title={c.s3}
          hint={c.s3Hint}
          lang={en ? "en" : "bn"}
        >
          <ZoneChips zones={zones} selected={selectedZones} onToggle={toggleZone} lang={en ? "en" : "bn"} />
        </FormSection>

        {/* 2026-09-27 — the terms a seller actually needs before signing up:
            commission, settlement and returns were nowhere on this page. */}
        <div className="rounded-2xl bg-ivory-100/70 p-4 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-900">
            {c.termsTitle}
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-soft">
            <li>
              {c.term1a}<strong>{c.term1b}</strong>{c.term1c}
            </li>
            <li>
              {c.term2}
            </li>
            <li>
              {c.term3a}<strong>{c.term3b}</strong>{c.term3c}
            </li>
            <li>
              {c.term4}
            </li>
          </ul>
          <label className="mt-3 flex items-start gap-2.5 text-xs font-medium text-forest-900">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-forest-700"
              aria-label={c.termsAgreeAria}
            />
            <span>
              {c.termsAgree}
            </span>
          </label>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl bg-ivory-100/70 p-4 text-xs leading-relaxed text-ink-soft ring-1 ring-line">
          <IconShield className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
          <p>
            {c.noteA}
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? c.submitting : c.submit}
        </button>

        <AlreadyAppliedLink href="/vendor/login" lang={en ? "en" : "bn"} />
      </form>
    </div>
  );
}
