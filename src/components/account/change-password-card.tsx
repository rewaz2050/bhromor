"use client";

/**
 * Self-service password change for vendor / rider dashboards (apply = sign
 * up, 2026-09-26). There is no e-mail or SMS reset in this marketplace: a
 * forgotten password is reset by staff to a temporary one, and this card is
 * how the owner replaces it with their own. Uses the browser session only —
 * `auth.updateUser({ password })` needs no service key.
 */

import { useId, useState, type FormEvent } from "react";
import { passwordProblem, APPLICANT_PASSWORD_MIN } from "@/lib/applicant-password";
import { bnDigits } from "@/lib/arrival";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const fieldClass =
  "block w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-forest-500/40 disabled:opacity-60";
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft";

export default function ChangePasswordCard({ className = "" }: { className?: string }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDone(false);
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    const client = getSupabaseBrowser();
    if (!client) {
      setError("লগইন সার্ভিস এই মুহূর্তে পাওয়া যাচ্ছে না — একটু পরে আবার চেষ্টা করুন।");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: authError } = await client.auth.updateUser({ password });
    setSaving(false);
    if (authError) {
      setError(
        /different from the old|same password/i.test(authError.message)
          ? "নতুন পাসওয়ার্ড আগেরটার থেকে আলাদা হতে হবে।"
          : "পাসওয়ার্ড বদলানো যায়নি — আবার চেষ্টা করুন।",
      );
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
  };

  return (
    <section className={`rounded-2xl bg-paper p-5 ring-1 ring-line ${className}`}>
      <h2 className="text-sm font-semibold text-forest-900">পাসওয়ার্ড বদলান</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        আবেদনের সময় দেওয়া পাসওয়ার্ড বা সাপোর্টের দেওয়া অস্থায়ী পাসওয়ার্ড এখানে বদলে নিন।
        ভুলে গেলে সাপোর্টে (WhatsApp) জানালে নতুন অস্থায়ী পাসওয়ার্ড দেওয়া হবে।
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200 sm:col-span-2">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="rounded-xl bg-forest-50 px-3.5 py-2.5 text-xs font-medium text-forest-900 ring-1 ring-forest-200 sm:col-span-2">
            পাসওয়ার্ড বদলে গেছে — পরের বার নতুন পাসওয়ার্ড দিয়ে সাইন ইন করুন।
          </p>
        )}
        <label className="block" htmlFor={`${id}-new`}>
          <span className={labelClass}>নতুন পাসওয়ার্ড</span>
          <input
            id={`${id}-new`}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={APPLICANT_PASSWORD_MIN}
            disabled={saving}
            className={fieldClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`অন্তত ${bnDigits(String(APPLICANT_PASSWORD_MIN))} অক্ষর`}
          />
        </label>
        <label className="block" htmlFor={`${id}-confirm`}>
          <span className={labelClass}>আবার লিখুন</span>
          <input
            id={`${id}-confirm`}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={APPLICANT_PASSWORD_MIN}
            disabled={saving}
            className={fieldClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
          >
            {saving ? "বদলানো হচ্ছে…" : "পাসওয়ার্ড বদলান"}
          </button>
          <button
            type="button"
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold text-forest-800 underline-offset-2 hover:underline"
          >
            {show ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
          </button>
        </div>
      </form>
    </section>
  );
}
