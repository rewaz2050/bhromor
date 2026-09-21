"use client";

import { useEffect, useState } from "react";
import { tidyPhoneInput } from "@/lib/phone";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { getAuthSnapshot } from "@/lib/customer-session";
import { useCustomer } from "@/lib/use-customer";
import {
  getWishlist,
  getWishlistServer,
  subscribeWishlist,
} from "@/lib/wishlist-store";
import {
  IconCheck,
  IconGift,
  IconSend,
  IconStar,
} from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/primitives";
import { LoyaltyCard } from "./loyalty-card";
import { ReferralCard } from "./referral-card";
import PlusCard from "./plus-card";
import OrderHistory from "./order-history";
import DashboardHero from "./dashboard-hero";

/**
 * Account panel — signup/login with NO verification: phone + password and
 * you are in, instantly (httpOnly session cookie).
 * On success the shared session store flips every consumer to the signed-in
 * dashboard view right here; a `?next=/somewhere` link (e.g. from checkout)
 * carries the customer back to where they were heading.
 *
 * Dashboard rebuild (2026-09-21): the identity block moved UP into a hero,
 * and the four programmes (orders, smart card, referral, PROSANTI+) live in
 * lazy tabs — one fetch when a tab opens, no endless scroll. Guests get the
 * form first, the honest value pitch beside it, teasers below.
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

type AccountTab = "orders" | "card" | "refer" | "plus";

export default function AccountView() {
  const { t } = useLanguage();
  const { customer, checked, refresh, signOut } = useCustomer();
  const guest = useSyncExternalStore(
    subscribeWishlist,
    getWishlist,
    getWishlistServer,
  );

  const [tab, setTab] = useState<AccountTab>("orders");
  const [authTab, setAuthTab] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [contact, setContact] = useState<string | null>(null);
  // Forgot password (P1 #15): there is no OTP/email on this site by design,
  // so the honest path is the shop's own number — fetched, never invented.
  useEffect(() => {
    let live = true;
    fetch("/api/contact", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { whatsapp?: string | null; phone?: string | null } | null) => {
        if (live && d) setContact(d.whatsapp ?? d.phone ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // The heading renders immediately — even while the session probe runs —
  // so the server HTML carries a real page, not a bare "checking…" line.
  const heading = (
    <header className="mb-8">
      <Eyebrow>{t("accountHero.pageEyebrow")}</Eyebrow>
      <h1 className="mt-4 font-display text-4xl text-forest-900 sm:text-5xl">
        {t("accountHero.pageTitle")}
      </h1>
    </header>
  );

  if (!checked) {
    return (
      <>
        {heading}
        <p role="status" className="py-12 text-ink-soft">
          সেশন চেক করা হচ্ছে…
        </p>
      </>
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
        ? "অ্যাকাউন্ট খোলা হয়েছে — আপনি এখনই লগ ইন করা আছেন!"
        : "লগ ইন সম্পন্ন — আপনি এখন আপনার অ্যাকাউন্ট ড্যাশবোর্ডে আছেন!",
    );
    const goTo = nextFromQuery();
    if (goTo) window.location.assign(goTo);
  };

  /** Duplicate phone tells the customer to log in — jump them to that tab. */
  const maybeSwitchToLogin = (message: string) => {
    if (authTab === "signup" && /লগ ইন করুন/.test(message)) setAuthTab("login");
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await fetch(
        authTab === "signup" ? "/api/account/signup" : "/api/account/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            authTab === "signup" ? { name, phone, password } : { phone, password },
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
      await finishAuth(authTab === "signup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "সমস্যা হয়েছে।");
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Signed in — hero + lazy programme tabs                            */
  /* ---------------------------------------------------------------- */
  if (customer) {
    const TABS: { key: AccountTab; label: string; icon: React.ReactNode }[] = [
      { key: "orders", label: t("accountTabs.orders"), icon: <IconGift className="h-4 w-4" /> },
      { key: "card", label: t("accountTabs.card"), icon: <IconStar className="h-4 w-4" /> },
      { key: "refer", label: t("accountTabs.refer"), icon: <IconSend className="h-4 w-4" /> },
      { key: "plus", label: t("accountTabs.plus"), icon: <IconStar className="h-4 w-4" /> },
    ];
    const panelId = (key: AccountTab) => `account-panel-${key}`;
    const tabId = (key: AccountTab) => `account-tab-${key}`;

    return (
      <div className="space-y-6">
        {heading}
        <DashboardHero
          customer={customer}
          wishlistCount={guest.length}
          done={done}
          busy={busy}
          onSignOut={() => {
            setError("");
            void signOut().then(() => setDone("লগ আউট হয়েছে।"));
          }}
        />

        <div
          role="tablist"
          aria-label={t("accountTabs.orders")}
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
          data-testid="account-tabs"
        >
          {TABS.map(({ key, label, icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={tabId(key)}
                aria-selected={active}
                aria-controls={panelId(key)}
                data-testid={`account-tab-${key}`}
                onClick={() => {
                  setTab(key);
                  setDone("");
                }}
                className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition-colors ${
                  active
                    ? "bg-forest-800 text-ivory-50 ring-forest-800"
                    : "bg-ivory-50 text-ink-soft ring-line hover:ring-line-strong"
                }`}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>

        {/* Lazy panels — a programme fetches only when it is on screen. */}
        <div
          role="tabpanel"
          id={panelId(tab)}
          aria-labelledby={tabId(tab)}
          data-testid={`account-panel-${tab}`}
        >
          {tab === "orders" ? <OrderHistory phone={customer.phone} /> : null}
          {tab === "card" ? <LoyaltyCard /> : null}
          {tab === "refer" ? <ReferralCard /> : null}
          {tab === "plus" ? <PlusCard /> : null}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Signed out — the form leads, the honest pitch sits beside it       */
  /* ---------------------------------------------------------------- */
  return (
    <div className="space-y-8">
      {heading}
      <div className="grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="order-2 border border-line bg-paper p-6 sm:p-8 lg:order-1">
          <h2 className="font-display text-3xl text-forest-900">
            {t("accountPitch.title")}
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
                aria-selected={authTab === key}
                onClick={() => {
                  setAuthTab(key);
                  setError("");
                }}
                className={`min-h-11 rounded-full px-5 text-sm font-semibold ring-1 transition-colors ${
                  authTab === key
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
            {authTab === "signup" && (
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
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01712345678"
                value={phone}
                onChange={(e) => setPhone(tidyPhoneInput(e.target.value))}
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
                autoComplete={authTab === "signup" ? "new-password" : "current-password"}
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
                : authTab === "signup"
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

          {authTab === "login" ? (
            <details className="mt-4 rounded-2xl bg-ivory-50 px-4 py-3 ring-1 ring-line" data-testid="forgot-password">
              <summary className="cursor-pointer text-sm font-semibold text-forest-900">
                {t("track.forgotTitle")}
              </summary>
              <p className="mt-2 text-xs leading-6 text-ink-soft">{t("track.forgotBody")}</p>
              {contact ? (
                <a
                  href={`https://wa.me/88${contact}?text=${encodeURIComponent(
                    `PROSANTI account — password reset for ${phone.trim() || "my number"}`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white"
                >
                  WhatsApp {contact}
                </a>
              ) : null}
            </details>
          ) : null}
        </div>

        {/* The honest "what is it FOR" card — real programmes only. */}
        <aside
          className="order-1 rounded-2xl border border-gold-300 bg-gradient-to-br from-gold-50 via-paper to-ivory-100 p-6 sm:p-8 lg:order-2"
          data-testid="account-pitch"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-700">
            {t("accountHero.signedIn") === "লগ ইন করা আছে" ? "কেন অ্যাকাউন্ট?" : "WHY AN ACCOUNT?"}
          </p>
          <ul className="mt-4 space-y-3.5">
            {(
              [
                ["accountPitch.stamps", <IconStar key="s" className="h-4 w-4 text-gold-600" />],
                ["accountPitch.refer", <IconSend key="r" className="h-4 w-4 text-gold-600" />],
                ["accountPitch.history", <IconCheck key="h" className="h-4 w-4 text-gold-600" />],
                ["accountPitch.plus", <IconGift key="p" className="h-4 w-4 text-gold-600" />],
              ] as const
            ).map(([key, icon]) => (
              <li key={key} className="flex items-start gap-3 text-sm leading-6 text-ink">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-100">
                  {icon}
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-gold-200 pt-4 text-xs leading-6 text-ink-soft">
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
        </aside>
      </div>

      {/* Programme teasers — what the dashboard will hold once inside. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <LoyaltyCard />
        <ReferralCard />
      </div>
    </div>
  );
}
