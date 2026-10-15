"use client";

/**
 * Self-service password change for CUSTOMER accounts (security 2026-10-14,
 * M6). POST /api/account/password — identity comes from the session cookie;
 * on success every other session is revoked server-side. New passwords need
 * 8+ chars and must not be trivially guessable (same policy as signup).
 *
 * Copy follows the storefront language. Server error text comes back in
 * Bangla from the API and is shown as-is.
 */

import { useId, useState, type FormEvent } from "react";
import { useLanguage } from "@/components/i18n/language-provider";

const fieldClass =
  "block w-full rounded-xl border border-line bg-ivory-50 px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-forest-500/40 disabled:opacity-60";
const labelClass = "block text-sm text-forest-900";

const COPY = {
  bn: {
    title: "পাসওয়ার্ড বদলান",
    hint: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে। বদলানোর পর অন্য যেকোনো ডিভাইস থেকে লগ আউট হয়ে যাবে — শুধু এই ব্রাউজারেই লগ ইন থাকবেন।",
    current: "বর্তমান পাসওয়ার্ড",
    next: "নতুন পাসওয়ার্ড",
    confirm: "নতুন পাসওয়ার্ড আবার",
    mismatch: "নতুন পাসওয়ার্ড দুটো মিলছে না।",
    failed: "পাসওয়ার্ড বদলানো যায়নি।",
    done: "পাসওয়ার্ড বদলে গেছে — অন্য ডিভাইসে নতুন পাসওয়ার্ড দিয়ে লগ ইন করুন।",
    busy: "বদলাচ্ছি…",
    submit: "পাসওয়ার্ড বদলান",
  },
  en: {
    title: "Change password",
    hint: "The new password must be at least 8 characters. Changing it signs you out on every other device — only this browser stays signed in.",
    current: "Current password",
    next: "New password",
    confirm: "New password again",
    mismatch: "The two new passwords do not match.",
    failed: "Could not change the password.",
    done: "Password changed — sign in on your other devices with the new password.",
    busy: "Changing…",
    submit: "Change password",
  },
} as const;

export default function CustomerPasswordCard({ className = "" }: { className?: string }) {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setDone(false);
    setError(null);
    if (next !== confirm) {
      setError(c.mismatch);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || c.failed);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`rounded-2xl border border-line bg-ivory-50 p-5 ${className}`}>
      <h3 className="font-semibold text-forest-900">{c.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{c.hint}</p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3" noValidate>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="rounded-xl bg-forest-50 p-3 text-sm text-forest-800">
            {c.done}
          </p>
        )}
        <label className={labelClass} htmlFor={`${id}-current`}>
          {c.current}
          <input
            id={`${id}-current`}
            type="password"
            required
            autoComplete="current-password"
            disabled={busy}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={`${fieldClass} mt-2 min-h-12`}
          />
        </label>
        <label className={labelClass} htmlFor={`${id}-new`}>
          {c.next}
          <input
            id={`${id}-new`}
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            disabled={busy}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={`${fieldClass} mt-2 min-h-12`}
          />
        </label>
        <label className={labelClass} htmlFor={`${id}-confirm`}>
          {c.confirm}
          <input
            id={`${id}-confirm`}
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            disabled={busy}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`${fieldClass} mt-2 min-h-12`}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-fit rounded-full bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? c.busy : c.submit}
        </button>
      </form>
    </section>
  );
}
