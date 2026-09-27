"use client";

/**
 * Rider sign-in (2026-09-26 apply = sign up).
 *
 * The rider application form sets the email + password, so this page only
 * signs in. A session that the rider API still refuses (application
 * pending, suspended, or a login with no rider row) gets a status card
 * with the next step — before this the page blindly redirected every
 * session to /rider, which bounced pending riders between the shell's
 * guest screen and here.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useRiderSession } from "@/lib/use-rider";
import { IconTruck } from "@/components/ui/icons";
import PasswordInput from "@/components/ui/password-input";
import { usePoll } from "@/lib/use-poll";
import ForgotPasswordPanel from "@/components/auth/forgot-password-panel";
import KycUploadCard from "@/components/rider/kyc-upload-card";
import { loginIdentifierToEmail } from "@/lib/phone-login";

/**
 * Supabase returns raw English auth errors ("Email not confirmed", "Invalid
 * login credentials"). Riders get the cause plus the next step, in Bangla.
 */
const supabaseSignInError = (err: { message?: string }): string => {
  const m = err.message ?? "";
  if (/email not confirmed/i.test(m)) {
    return "ইমেইলটি এখনো কনফার্ম হয়নি — ইনবক্সে (স্প্যামসহ) পাঠানো কনফার্মেশন লিংকে ক্লিক করুন, তারপর আবার লগইন করুন।";
  }
  if (/invalid login credentials/i.test(m)) {
    return "ইমেইল/মোবাইল নম্বর বা পাসওয়ার্ড মিলছে না। রাইডার আবেদনের সময় যে তথ্য দিয়েছিলেন সেটাই ব্যবহার করুন।";
  }
  if (/rate limit|too many/i.test(m)) {
    return "অনেকবার চেষ্টা হয়েছে — এক মিনিট পর আবার করুন।";
  }
  return m ? `লগইন করা যায়নি: ${m}` : "লগইন করা যায়নি। সঠিক তথ্য দিয়ে চেষ্টা করুন।";
};

const secondaryClass =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-4 text-xs font-semibold text-forest-900 ring-1 ring-line transition-colors hover:bg-ivory-100";

/** Pending-approval re-check cadence (visible tab only). */
const PENDING_RECHECK_MS = 30_000;

export default function RiderLoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const { status, error, denyReason, refresh, signOut } = useRiderSession();
  // Apply = sign up: a pending applicant usually leaves this tab open, so
  // re-check every 30 s while visible and send them in the moment staff approves.
  usePoll(refresh, PENDING_RECHECK_MS, status === "guest" && denyReason === "pending");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authed") router.replace("/rider");
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Round 4 — e-mail OR mobile number; a number becomes the synthetic
    // login address the application was created with (no SMS involved).
    const cleanEmail = loginIdentifierToEmail(email);
    if (!cleanEmail) {
      setFormError("সঠিক ইমেইল অ্যাড্রেস বা ১১-সংখ্যার মোবাইল নম্বর লিখুন।");
      return;
    }
    if (password.length < 6) {
      setFormError("পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }

    if (!supabase) {
      // Never bounce the rider into the guest loop — say what is missing.
      setFormError(
        "সার্ভারে লগইন সিস্টেম এখনো কনফিগার হয়নি (Supabase key নেই)। একটু পরে আবার চেষ্টা করুন।",
      );
      return;
    }

    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInError) {
        setFormError(supabaseSignInError(signInError));
        return;
      }
      // The probe decides: active → /rider, pending → the status card below.
      await refresh();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "লগইন করা যায়নি। সঠিক তথ্য দিয়ে চেষ্টা করুন।",
      );
    } finally {
      setBusy(false);
    }
  };

  const denied = status === "guest" && error !== null;

  return (
    <div className="flex-1 flex flex-col justify-center p-6 sm:p-8">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-gold-300 ring-2 ring-gold-400/30">
          <IconTruck className="h-7 w-7" />
        </span>
        <h1 className="font-display mt-4 text-2xl font-bold text-forest-900 sm:text-3xl">
          PROSANTI রাইডার লগইন
        </h1>
        <p className="mt-1 text-xs text-ink-soft sm:text-sm">
          ডেলিভারি ট্রিপ গ্রহণ, কাস্টমার পিন ভেরিফিকেশন ও ক্যাশ কালেকশন পোর্টাল
        </p>
      </div>

      {status === "checking" ? (
        <div
          className="mt-8 h-56 animate-pulse rounded-3xl bg-line/60"
          aria-label="লোড হচ্ছে"
        />
      ) : denied ? (
        <section
          aria-labelledby="rider-status-heading"
          className="mt-8 space-y-4 rounded-3xl border border-line bg-paper p-6 shadow-sm"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-forest-700">
            {denyReason === "pending"
              ? "আবেদন জমা আছে"
              : denyReason === "rejected"
                ? "আবেদন অনুমোদন হয়নি"
                : denyReason === "suspended"
                  ? "অ্যাকাউন্ট সাসপেন্ড"
                  : "এই লগইনে রাইডার প্রোফাইল নেই"}
          </p>
          <h2 id="rider-status-heading" className="font-display text-lg font-bold text-forest-900">
            {denyReason === "pending"
              ? "অ্যাডমিনের অনুমোদনের অপেক্ষায়"
              : denyReason === "rejected"
                ? "তথ্য ঠিক করে আবার আবেদন করুন"
                : denyReason === "suspended"
                  ? "রাইডার অ্যাকাউন্ট সাসপেন্ড করা আছে"
                  : "রাইডার আবেদন করুন"}
          </h2>
          <p
            role="status"
            className={`rounded-xl p-3 text-xs ring-1 ${
              denyReason === "pending"
                ? "bg-amber-50 text-amber-900 ring-amber-200"
                : "bg-rose-50 text-rose-800 ring-rose-200"
            }`}
          >
            {error}
          </p>
          {denyReason === "pending" && (
            <p className="text-xs text-ink-soft">
              আপনি লগইন অবস্থায় আছেন। অনুমোদন হয়ে গেলে এই ইমেইল/মোবাইল নম্বর ও
              পাসওয়ার্ডেই রাইডার অ্যাপ খুলবে — এই পেইজ খোলা থাকলে প্রতি ৩০
              সেকেন্ডে নিজে থেকেই দেখে নেবে, চাইলে “আবার দেখুন” চাপুন।
            </p>
          )}
          {denyReason === "rejected" && (
            <>
              <p className="text-xs text-ink-soft">
                আপনার লগইন ঠিকই আছে। উপরের কারণটি ঠিক করে আবেদন ফর্মটি আবার
                জমা দিন — একই ইমেইল/মোবাইল নম্বর ও পাসওয়ার্ড দিলে আগের আবেদনটিই
                নতুন তথ্যসহ অ্যাডমিনের কিউতে ফিরে যাবে।
              </p>
              <Link
                href="/rider/apply"
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
              >
                তথ্য ঠিক করে আবার আবেদন করুন →
              </Link>
            </>
          )}
          {denyReason === "none" && (
            <Link
              href="/rider/apply"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
            >
              রাইডার আবেদন ফর্ম →
            </Link>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void refresh()} className={secondaryClass}>
              আবার দেখুন
            </button>
            <button type="button" onClick={() => void signOut()} className={secondaryClass}>
              সাইন আউট
            </button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-3xl border border-line bg-paper p-6 shadow-sm"
        >
          <h2 className="font-display text-base font-bold text-forest-900">সাইন ইন (Login)</h2>
          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}

          <div>
            <label htmlFor="rider-login-email" className="mb-1 block text-xs font-semibold text-forest-900">
              ইমেইল অ্যাড্রেস বা মোবাইল নম্বর
            </label>
            <input
              id="rider-login-email"
              type="text"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-2xl border border-line bg-ivory-50 px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest-800"
              placeholder="017XXXXXXXX অথবা rider@example.com"
            />
          </div>
          <div>
            <label htmlFor="rider-login-password" className="mb-1 block text-xs font-semibold text-forest-900">
              পাসওয়ার্ড
            </label>
            <PasswordInput
              id="rider-login-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-2xl border border-line bg-ivory-50 px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest-800"
              placeholder="••••••••"
              toggle={{ show: "দেখুন", hide: "লুকান" }}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-full bg-forest-800 font-semibold text-xs text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
          >
            {busy ? "যাচাই হচ্ছে…" : "লগইন করুন"}
          </button>
          <p className="text-center text-[11px] leading-relaxed text-ink-soft">
            রাইডার আবেদনের সময় দেওয়া ইমেইল (বা ইমেইল না দিলে মোবাইল নম্বর) ও
            পাসওয়ার্ড দিন — অ্যাডমিন অনুমোদন করলেই অ্যাপ খুলবে।
          </p>
        </form>
      )}
      {denied && (denyReason === "pending" || denyReason === "rejected") && (
        // Round 4 — NID / selfie / licence photos while waiting; staff see them before approving.
        <KycUploadCard className="mt-4" />
      )}
      {status !== "checking" && !denied && (
        // এসএমএস/ইমেইল ছাড়া রিসেট: অনুরোধ → অ্যাডমিনের ফোন-যাচাই → এখানেই নতুন পাসওয়ার্ড।
        <ForgotPasswordPanel kind="rider" lang="bn" onDone={setEmail} className="mt-4" />
      )}

      <div className="mt-8 text-center space-y-2 text-xs text-ink-soft">
        <p>
          রাইডার হিসেবে এখনো রেজিস্টার করেননি?{" "}
          <Link href="/rider/apply" className="font-semibold text-forest-800 underline">
            এখানে আবেদন করুন
          </Link>
        </p>
        <p>
          <Link href="/" className="underline text-ink-soft hover:text-forest-900">
            ← স্টোরফ্রন্টে ফিরে যান
          </Link>
        </p>
      </div>
    </div>
  );
}
