"use client";

/**
 * "Forgot password?" on the vendor / rider login pages (2026-09-26; no SMS,
 * no e-mail).
 *
 * Flow: email + phone on file → request filed → staff call and approve →
 * this panel (polling every 20 s, and again on return thanks to a small
 * localStorage note) switches to the new-password form by itself → done,
 * the login form is prefilled. A rejection shows the staff note and lets
 * them ask again.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { APPLICANT_PASSWORD_MIN, passwordProblem } from "@/lib/applicant-password";
import { bnDigits } from "@/lib/arrival";
import { tidyPhoneInput } from "@/lib/phone";
import { usePoll } from "@/lib/use-poll";
import PasswordInput from "@/components/ui/password-input";

type Kind = "vendor" | "rider";
type Lang = "bn" | "en";
type Step = "closed" | "form" | "pending" | "set" | "done" | "rejected" | "expired";

interface StatusPayload {
  status: "none" | "pending" | "approved" | "rejected" | "used" | "expired";
  note?: string | null;
  expiresAt?: string | null;
  error?: string;
}

export const RESET_STATUS_POLL_MS = 20_000;
const storageKey = (kind: Kind) => `prosanti.reset.${kind}`;

const COPY: Record<Lang, Record<string, string>> = {
  bn: {
    open: "পাসওয়ার্ড ভুলে গেছেন?",
    title: "পাসওয়ার্ড রিসেটের অনুরোধ",
    intro:
      "আবেদনের সময় দেওয়া ইমেইল ও মোবাইল নম্বর দিন। অ্যাডমিন ফোনে নিশ্চিত হয়ে অনুমোদন দিলে এখানেই নতুন পাসওয়ার্ড দিতে পারবেন — কোনো এসএমএস বা ইমেইল আসবে না।",
    email: "ইমেইল",
    phone: "মোবাইল নম্বর",
    submit: "অনুরোধ পাঠান",
    sending: "পাঠানো হচ্ছে…",
    cancel: "বাতিল",
    pendingTitle: "অনুরোধ জমা হয়েছে — অ্যাডমিনের অনুমোদনের অপেক্ষায়",
    pendingBody:
      "অ্যাডমিন আপনার নম্বরে ফোন করে নিশ্চিত হবেন। অনুমোদন হলে এই পেইজ নিজে থেকেই নতুন পাসওয়ার্ডের ঘর দেখাবে (প্রতি ২০ সেকেন্ডে দেখে নেয়)। পেইজ বন্ধ করলেও পরে এসে একই জায়গা থেকে চালিয়ে যেতে পারবেন।",
    check: "আবার দেখুন",
    checking: "দেখা হচ্ছে…",
    setTitle: "অনুমোদিত — নতুন পাসওয়ার্ড দিন",
    setBody: "এখন নতুন পাসওয়ার্ড লিখুন। ২৪ ঘণ্টার মধ্যে না দিলে আবার অনুরোধ করতে হবে।",
    newPassword: "নতুন পাসওয়ার্ড",
    confirm: "আবার লিখুন",
    save: "পাসওয়ার্ড সেট করুন",
    saving: "সেট হচ্ছে…",
    doneTitle: "পাসওয়ার্ড বদলে গেছে",
    doneBody: "এখন নিচের ফর্মে নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।",
    rejectedTitle: "অনুরোধটি অনুমোদন করা যায়নি",
    rejectedBody: "অ্যাডমিনের নোট:",
    rejectedNoNote: "আবেদনের সময়ের ইমেইল ও ফোন নম্বর মিলিয়ে আবার অনুরোধ করুন, বা সাপোর্টে জানান।",
    expiredTitle: "অনুমোদনের ২৪ ঘণ্টা পেরিয়ে গেছে",
    expiredBody: "আবার অনুরোধ করুন — অ্যাডমিন আবার অনুমোদন দিলে নতুন পাসওয়ার্ড দিতে পারবেন।",
    again: "আবার অনুরোধ করুন",
    close: "বন্ধ করুন",
    show: "দেখুন",
    hide: "লুকান",
    failed: "অনুরোধ পাঠানো যায়নি — আবার চেষ্টা করুন।",
    statusFailed: "অবস্থা জানা যায়নি — একটু পরে আবার দেখুন।",
  },
  en: {
    open: "Forgot your password?",
    title: "Request a password reset",
    intro:
      "Enter the email and mobile number from your application. Staff confirm by phone and approve; then you set a new password right here — no SMS or e-mail is sent.",
    email: "Email",
    phone: "Mobile number",
    submit: "Send request",
    sending: "Sending…",
    cancel: "Cancel",
    pendingTitle: "Request received — waiting for staff approval",
    pendingBody:
      "Staff will call your number to confirm. Once approved, this page shows the new-password form by itself (it re-checks every 20 seconds). You can close it and continue from here later.",
    check: "Check again",
    checking: "Checking…",
    setTitle: "Approved — set your new password",
    setBody: "Type a new password now. The window closes 24 hours after approval.",
    newPassword: "New password",
    confirm: "Repeat it",
    save: "Set password",
    saving: "Saving…",
    doneTitle: "Password changed",
    doneBody: "Sign in below with the new password.",
    rejectedTitle: "The request was not approved",
    rejectedBody: "Note from staff:",
    rejectedNoNote: "Ask again with the exact email and phone from your application, or message support.",
    expiredTitle: "The 24-hour window has passed",
    expiredBody: "Send a new request — once staff approve it again you can set the password.",
    again: "Request again",
    close: "Close",
    show: "Show",
    hide: "Hide",
    failed: "Could not send the request — please try again.",
    statusFailed: "Could not check the status — try again in a moment.",
  },
};

const readStored = (kind: Kind): { email: string; phone: string } | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: unknown; phone?: unknown };
    return typeof parsed.email === "string" && typeof parsed.phone === "string"
      ? { email: parsed.email, phone: parsed.phone }
      : null;
  } catch {
    return null;
  }
};

const writeStored = (kind: Kind, value: { email: string; phone: string } | null) => {
  try {
    if (value) window.localStorage.setItem(storageKey(kind), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(kind));
  } catch {
    // Private mode — the poll simply will not survive a reload.
  }
};

export default function ForgotPasswordPanel({
  kind,
  lang,
  onDone,
  className = "",
}: {
  kind: Kind;
  lang: Lang;
  /** Called with the email once the password is set — prefill the login form. */
  onDone?: (email: string) => void;
  className?: string;
}) {
  const t = COPY[lang];
  const [step, setStep] = useState<Step>("closed");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const applyStatus = useCallback(
    (payload: StatusPayload) => {
      switch (payload.status) {
        case "pending":
          setStep("pending");
          break;
        case "approved":
          setStep("set");
          break;
        case "rejected":
          setNote(payload.note ?? null);
          setStep("rejected");
          break;
        case "expired":
          setStep("expired");
          break;
        case "used":
        case "none":
          writeStored(kind, null);
          setStep((s) => (s === "pending" ? "closed" : s));
          break;
      }
    },
    [kind],
  );

  const checkStatus = useCallback(
    async (who: { email: string; phone: string }): Promise<void> => {
      try {
        const qs = new URLSearchParams({ kind, email: who.email, phone: who.phone });
        const res = await fetch(`/api/auth/reset-request?${qs.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as StatusPayload | null;
        if (!res.ok || !data) {
          setError(data?.error ?? t.statusFailed);
          return;
        }
        setError(null);
        applyStatus(data);
      } catch {
        setError(t.statusFailed);
      }
    },
    [applyStatus, kind, t.statusFailed],
  );

  // A request in flight survives reloads: pick it up and ask where it stands.
  useEffect(() => {
    const stored = readStored(kind);
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted state on mount
    setEmail(stored.email);
    setPhone(stored.phone);
    setStep("pending");
    void checkStatus(stored);
  }, [kind, checkStatus]);

  usePoll(() => checkStatus({ email, phone }), RESET_STATUS_POLL_MS, step === "pending");

  const submitRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, email: email.trim(), phone: phone.trim() }),
      });
      const data = (await res.json().catch(() => null)) as StatusPayload | null;
      if (!res.ok || !data) {
        setError(data?.error ?? t.failed);
        return;
      }
      const who = { email: email.trim().toLowerCase(), phone: tidyPhoneInput(phone) };
      setEmail(who.email);
      setPhone(who.phone);
      writeStored(kind, who);
      applyStatus(data);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, email, phone, password }),
      });
      const data = (await res.json().catch(() => null)) as { done?: boolean; error?: string } | null;
      if (!res.ok || !data?.done) {
        if (res.status === 410) setStep("expired");
        setError(data?.error ?? t.failed);
        return;
      }
      writeStored(kind, null);
      setPassword("");
      setConfirm("");
      setStep("done");
      onDone?.(email);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const manualCheck = async () => {
    setBusy(true);
    await checkStatus({ email, phone });
    setBusy(false);
  };

  const inputClass =
    "h-12 w-full rounded-2xl border border-line bg-ivory-50 px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest-800";
  const labelClass = "mb-1 block text-xs font-semibold text-forest-900";
  const primary =
    "inline-flex h-12 w-full items-center justify-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60";
  const secondary =
    "inline-flex h-12 w-full items-center justify-center rounded-full bg-paper px-4 text-xs font-semibold text-forest-900 ring-1 ring-line transition-colors hover:bg-ivory-100 disabled:opacity-60";

  if (step === "closed") {
    return (
      <p className={`text-center ${className}`}>
        <button
          type="button"
          onClick={() => setStep("form")}
          className="min-h-11 px-3 text-xs font-semibold text-forest-800 underline underline-offset-2"
        >
          {t.open}
        </button>
      </p>
    );
  }

  return (
    <section
      aria-labelledby="forgot-password-heading"
      className={`space-y-3 rounded-3xl border border-line bg-paper p-5 shadow-sm ${className}`}
    >
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {step === "form" && (
        <form onSubmit={(e) => void submitRequest(e)} className="space-y-3" noValidate>
          <h2 id="forgot-password-heading" className="font-display text-base font-bold text-forest-900">
            {t.title}
          </h2>
          <p className="text-xs leading-relaxed text-ink-soft">{t.intro}</p>
          <div>
            <label htmlFor={`reset-${kind}-email`} className={labelClass}>
              {t.email}
            </label>
            <input
              id={`reset-${kind}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`reset-${kind}-phone`} className={labelClass}>
              {t.phone}
            </label>
            <input
              id={`reset-${kind}-phone`}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              required
              value={phone}
              onChange={(e) => setPhone(tidyPhoneInput(e.target.value))}
              placeholder="017XXXXXXXX"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setStep("closed")} className={secondary}>
              {t.cancel}
            </button>
            <button type="submit" disabled={busy} className={primary}>
              {busy ? t.sending : t.submit}
            </button>
          </div>
        </form>
      )}

      {step === "pending" && (
        <div className="space-y-3">
          <h2 id="forgot-password-heading" className="font-display text-base font-bold text-forest-900">
            {t.pendingTitle}
          </h2>
          <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
            {t.pendingBody}
          </p>
          <p className="text-xs text-ink-soft">
            {email} · {lang === "bn" ? bnDigits(phone) : phone}
          </p>
          <button type="button" disabled={busy} onClick={() => void manualCheck()} className={secondary}>
            {busy ? t.checking : t.check}
          </button>
        </div>
      )}

      {step === "set" && (
        <form onSubmit={(e) => void submitPassword(e)} className="space-y-3" noValidate>
          <h2 id="forgot-password-heading" className="font-display text-base font-bold text-forest-900">
            {t.setTitle}
          </h2>
          <p role="status" className="rounded-xl bg-forest-50 p-3 text-xs leading-relaxed text-forest-900 ring-1 ring-forest-200">
            {t.setBody}
          </p>
          <div>
            <label htmlFor={`reset-${kind}-new`} className={labelClass}>
              {t.newPassword}
            </label>
            <PasswordInput
              id={`reset-${kind}-new`}
              autoComplete="new-password"
              minLength={APPLICANT_PASSWORD_MIN}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              toggle={{ show: t.show, hide: t.hide }}
            />
          </div>
          <div>
            <label htmlFor={`reset-${kind}-confirm`} className={labelClass}>
              {t.confirm}
            </label>
            <PasswordInput
              id={`reset-${kind}-confirm`}
              autoComplete="new-password"
              minLength={APPLICANT_PASSWORD_MIN}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
              toggle={{ show: t.show, hide: t.hide }}
            />
          </div>
          <button type="submit" disabled={busy} className={primary}>
            {busy ? t.saving : t.save}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="space-y-3">
          <h2 id="forgot-password-heading" className="font-display text-base font-bold text-forest-900">
            {t.doneTitle}
          </h2>
          <p role="status" className="rounded-xl bg-forest-50 p-3 text-xs leading-relaxed text-forest-900 ring-1 ring-forest-200">
            {t.doneBody}
          </p>
          <button type="button" onClick={() => setStep("closed")} className={secondary}>
            {t.close}
          </button>
        </div>
      )}

      {(step === "rejected" || step === "expired") && (
        <div className="space-y-3">
          <h2 id="forgot-password-heading" className="font-display text-base font-bold text-forest-900">
            {step === "rejected" ? t.rejectedTitle : t.expiredTitle}
          </h2>
          <p role="status" className="rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-800 ring-1 ring-rose-200">
            {step === "rejected" ? (note ? `${t.rejectedBody} ${note}` : t.rejectedNoNote) : t.expiredBody}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                writeStored(kind, null);
                setStep("closed");
              }}
              className={secondary}
            >
              {t.close}
            </button>
            <button
              type="button"
              onClick={() => {
                writeStored(kind, null);
                setNote(null);
                setStep("form");
              }}
              className={primary}
            >
              {t.again}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
