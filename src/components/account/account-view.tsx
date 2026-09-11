"use client";

import { useState } from "react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getAuthSnapshot } from "@/lib/customer-session";
import { useCustomer } from "@/lib/use-customer";
import {
  getWishlist,
  getWishlistServer,
  subscribeWishlist,
} from "@/lib/wishlist-store";
import { LoyaltyCard } from "./loyalty-card";

/**
 * Account panel — signup/login with NO verification: phone + password and
 * you are in, instantly (httpOnly session cookie).
 * On success the shared session store flips every consumer to the signed-in
 * dashboard view right here; a `?next=/somewhere` link (e.g. from checkout)
 * carries the customer back to where they were heading.
 */

/** Same-origin relative redirect target from ?next= — or null. */
const nextFromQuery = (): string | null => {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    // Already on the destination (e.g. /account?next=/account): the in-place
    // dashboard switch IS the navigation — don't reload the same page.
    if (url.pathname === window.location.pathname) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

export default function AccountView() {
  const { customer, checked, refresh, signOut } = useCustomer();
  const guest = useSyncExternalStore(
    subscribeWishlist,
    getWishlist,
    getWishlistServer,
  );

  const [tab, setTab] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!checked) {
    return (
      <p role="status" className="py-12 text-ink-soft">
        সেশন চেক করা হচ্ছে…
      </p>
    );
  }

  /** Shared success tail: refresh the session store, announce, then move. */
  const finishAuth = async (signup: boolean) => {
    await refresh();
    setPassword("");
    // The cookie is set — but if the probe still can't see a session, say
    // so instead of a fake success that leaves the form on screen.
    const snap = getAuthSnapshot();
    if (snap.mode === "live" && !snap.customer) {
      throw new Error(
        "সেশন তৈরি হলো বলে মনে হচ্ছে না — ব্রাউজারে third-party/cookie block বন্ধ করে আবার চেষ্টা করুন।",
      );
    }
    setDone(
      signup
        ? "✅ অ্যাকাউন্ট খোলা হয়েছে — আপনি এখনই লগ ইন করা আছেন!"
        : "✅ লগ ইন সম্পন্ন — আপনি এখন আপনার অ্যাকাউন্ট ড্যাশবোর্ডে আছেন!",
    );
    const goTo = nextFromQuery();
    if (goTo) window.location.assign(goTo);
  };

  /** Duplicate phone tells the customer to log in — jump them to that tab. */
  const maybeSwitchToLogin = (message: string) => {
    if (tab === "signup" && /লগ ইন করুন/.test(message)) setTab("login");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(
        tab === "signup" ? "/api/account/signup" : "/api/account/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            tab === "signup" ? { name, phone, password } : { phone, password },
          ),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        const message = body.error || "সমস্যা হয়েছে — আবার চেষ্টা করুন।";
        maybeSwitchToLogin(message);
        throw new Error(message);
      }
      await finishAuth(tab === "signup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "সমস্যা হয়েছে।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <LoyaltyCard />

      <div className="border border-line bg-paper p-6 sm:p-10">
        {customer ? (
          <>
            <p className="text-xs uppercase tracking-widest text-gold-600">
              লগ ইন করা আছে — আপনার ড্যাশবোর্ড
            </p>
            {done && (
              <p role="status" className="mt-3 text-sm text-forest-800">
                {done}
              </p>
            )}
            <h2 className="mt-3 break-words font-display text-2xl text-forest-900">
              {customer.name}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              মোবাইল: {customer.phone} · স্মার্ট কার্ডের স্ট্যাম্প এই অ্যাকাউন্টেই
              জমা হচ্ছে
            </p>
            <p className="mt-4 text-sm leading-7 text-ink-soft">
              অর্ডার করার সময় এই নম্বর ব্যবহার করলেই প্রতিটি অর্ডারে ১টি করে
              স্ট্যাম্প পড়বে।
            </p>
            <Link
              href="/wishlist"
              className="editorial-button mt-6 bg-forest-800 text-white"
            >
              আপনার ওয়ান্টলিস্ট ({guest.length}) →
            </Link>
            <div className="mt-7 border-t border-line pt-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError("");
                  void signOut().then(() => setDone("লগ আউট হয়েছে।"));
                }}
                className="min-h-11 text-sm text-ink-soft underline disabled:opacity-40"
              >
                {busy ? "লগ আউট হচ্ছে…" : "এই ডিভাইস থেকে লগ আউট"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl text-forest-900">
              ফ্রি অ্যাকাউন্ট — কোনো ভেরিফিকেশন নেই
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-soft">
              নাম, মোবাইল নম্বর আর পাসওয়ার্ড দিলেই অ্যাকাউন্ট — কোনো OTP বা
              ইমেইল কোড লাগবে না। সাইন আপ করলেই <strong>সাথে সাথে লগ ইন</strong>{" "}
              হয়ে যাবেন এবং স্মার্ট কার্ডে স্ট্যাম্প জমা শুরু হবে।
            </p>

            <div className="mt-6 flex gap-2" role="tablist" aria-label="অ্যাকাউন্ট">
              {(
                [
                  ["signup", "নতুন অ্যাকাউন্ট"],
                  ["login", "লগ ইন"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => {
                    setTab(key);
                    setError("");
                  }}
                  className={`min-h-11 rounded-full px-5 text-sm font-semibold ring-1 transition-colors ${
                    tab === key
                      ? "bg-forest-800 text-white ring-forest-800"
                      : "bg-ivory-50 text-ink-soft ring-line hover:ring-line-strong"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="mt-6 space-y-4"
            >
              {tab === "signup" && (
                <div>
                  <label htmlFor="ac-name" className="text-sm text-forest-900">
                    আপনার নাম
                  </label>
                  <input
                    id="ac-name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                    className="mt-2 h-14 w-full border border-line bg-ivory-50 px-4 text-base"
                  />
                </div>
              )}
              <div>
                <label htmlFor="ac-phone" className="text-sm text-forest-900">
                  মোবাইল নম্বর
                </label>
                <input
                  id="ac-phone"
                  required
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="01712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  className="mt-2 h-14 w-full border border-line bg-ivory-50 px-4 text-base"
                />
              </div>
              <div>
                <label htmlFor="ac-password" className="text-sm text-forest-900">
                  পাসওয়ার্ড
                </label>
                <input
                  id="ac-password"
                  type="password"
                  required
                  minLength={6}
                  maxLength={72}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  className="mt-2 h-14 w-full border border-line bg-ivory-50 px-4 text-base"
                />
              </div>
              <button
                disabled={busy}
                className="editorial-button w-full bg-forest-800 text-white disabled:opacity-40"
              >
                {busy
                  ? "করা হচ্ছে…"
                  : tab === "signup"
                    ? "সাইন আপ করুন — সাথে সাথে লগ ইন"
                    : "লগ ইন করুন"}
              </button>
            </form>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-800">
                {error}
              </p>
            )}
            {done && (
              <p role="status" className="mt-4 text-sm text-forest-800">
                {done}
              </p>
            )}

            <p className="mt-5 text-xs leading-6 text-ink-soft">
              গেস্ট হয়ে অর্ডার করাও রইল; তবে স্মার্ট কার্ডের স্ট্যাম্প জমাতে
              অ্যাকাউন্ট লাগবে। চলমান নিয়ম:{" "}
              <Link href="/terms" className="underline">
                শর্তাবলি
              </Link>{" "}
              ·{" "}
              <Link href="/privacy" className="underline">
                প্রাইভেসি
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
