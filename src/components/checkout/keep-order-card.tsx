"use client";

/**
 * "Keep this order in your account" — the account asked for AFTER the order
 * (checkout pass, 2026-10-06).
 *
 * Sign-up used to sit in front of the first purchase: a form to fill before
 * a stranger had any reason to trust the shop. Now the order is placed as a
 * guest, and the receipt offers the one thing an account is actually for —
 * this order, and the next one, without typing the address again.
 *
 * The name and phone come from the order just placed, so the card asks for a
 * password and nothing else. It is skippable: the order is already in.
 *
 * Copy follows the storefront language. Server error text is shown as the
 * API returns it.
 */

import { useState } from "react";
import Link from "next/link";
import PasswordInput from "@/components/ui/password-input";
import { IconCheck, IconUser } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

export const MIN_PASSWORD = 6;

const COPY = {
  bn: {
    tooShort: (n: number) => `পাসওয়ার্ড কমপক্ষে ${n} অক্ষরের হতে হবে।`,
    signupFail: "অ্যাকাউন্ট তৈরি করা গেল না — পরে চেষ্টা করুন।",
    offline: "সংযোগ পাওয়া যাচ্ছে না — পরে আবার চেষ্টা করুন।",
    saved: (id: string) => `অর্ডার ${id} আপনার অ্যাকাউন্টে রইল — পরের বার ঠিকানা আবার লিখতে হবে না।`,
    viewAccount: "আমার অ্যাকাউন্ট দেখুন",
    heading: "এই অর্ডারটি আপনার অ্যাকাউন্টে রাখুন",
    body: "অর্ডারটি হয়ে গেছে — অ্যাকাউন্ট শুধু একটা কাজের: এই অর্ডার, আর পরের বারের ঠিকানা। শুধু একটা পাসওয়ার্ড দিন, নাম ও নম্বর এই অর্ডার থেকেই।",
    passwordLabel: "পাসওয়ার্ড",
    placeholder: (n: number) => `পাসওয়ার্ড (কমপক্ষে ${n} অক্ষর)`,
    saving: "সংরক্ষণ হচ্ছে…",
    save: "সংরক্ষণ করুন",
    login: "লগইন করুন",
  },
  en: {
    tooShort: (n: number) => `The password must be at least ${n} characters.`,
    signupFail: "Could not create the account — please try again later.",
    offline: "No connection — please try again in a moment.",
    saved: (id: string) => `Order ${id} is now in your account — you won't need to type the address again next time.`,
    viewAccount: "View my account",
    heading: "Keep this order in your account",
    body: "Your order is placed. An account is just for this order and your next one's address. Set a password — your name and number come from this order.",
    passwordLabel: "Password",
    placeholder: (n: number) => `Password (at least ${n} characters)`,
    saving: "Saving…",
    save: "Save",
    login: "Sign in",
  },
} as const;

type State = "idle" | "saving" | "done" | "exists" | "error";

export default function KeepOrderCard({
  name,
  phone,
  orderId,
}: {
  name: string;
  phone: string;
  /** Shown back on success so the card says what it actually saved. */
  orderId: string;
}) {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setState("error");
      setMessage(c.tooShort(MIN_PASSWORD));
      return;
    }
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/account/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password }),
      });
      if (res.ok || res.status === 201) {
        setState("done");
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      // 409: this number already has an account — nothing was lost, the
      // order is linked to it by phone.
      setState(res.status === 409 ? "exists" : "error");
      setMessage(data?.error ?? c.signupFail);
    } catch {
      setState("error");
      setMessage(c.offline);
    }
  };

  if (state === "done") {
    return (
      <section
        role="status"
        data-testid="keep-order-done"
        className="mx-auto mt-4 max-w-sm rounded-3xl bg-forest-50 p-6 text-left ring-1 ring-forest-200"
      >
        <p className="flex items-start gap-2 text-sm font-semibold text-forest-900">
          <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {c.saved(orderId)}
          </span>
        </p>
        <Link
          href="/account"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          {c.viewAccount}
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="keep-order-title"
      data-testid="keep-order-card"
      className="mx-auto mt-4 max-w-sm rounded-3xl bg-paper p-6 text-left ring-1 ring-line"
    >
      <h2
        id="keep-order-title"
        className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft"
      >
        <IconUser className="h-3.5 w-3.5" />
        {c.heading}
      </h2>
      <p className="mt-2 text-xs leading-6 text-ink-soft">
        {c.body}
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">{c.passwordLabel}</span>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (state !== "idle") setState("idle");
            }}
            placeholder={c.placeholder(MIN_PASSWORD)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            aria-invalid={state === "error"}
            className="h-12 w-full rounded-2xl bg-ivory-50 px-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest-500"
          />
        </label>
        <button
          type="submit"
          disabled={state === "saving"}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          {state === "saving" ? c.saving : c.save}
        </button>
      </form>
      {message ? (
        <p
          role={state === "error" ? "alert" : "status"}
          className={`mt-2 text-xs leading-5 ${state === "error" ? "text-rose-700" : "text-ink-soft"}`}
        >
          {message}
          {state === "exists" ? (
            <>
              {" "}
              <Link href="/account" className="font-semibold text-forest-800 underline">
                {c.login}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
