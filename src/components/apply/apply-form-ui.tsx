"use client";

/**
 * Shared pieces of the shop / rider application forms (apply = sign up,
 * 2026-09-26). Bangla-first: these pages are the first thing a partner in
 * Sunamganj sees, usually on a phone, so every piece is thumb-sized (≥44px
 * targets), explains what happens next, and puts errors in front of the eyes
 * instead of above the fold.
 */

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { bnDigits } from "@/lib/arrival";

const STEPS: Record<"vendor" | "rider", { title: string; body: string }[]> = {
  vendor: [
    { title: "আবেদন জমা দিন", body: "ফর্ম পূরণ করলেই ইমেইল ও পাসওয়ার্ডে আপনার ভেন্ডর লগইন তৈরি হয়ে যায়।" },
    { title: "অ্যাডমিন যাচাই", body: "টিম দোকানের তথ্য দেখে অনুমোদন দেয় — সাধারণত এক কর্মদিবসের মধ্যে।" },
    { title: "ড্যাশবোর্ড খুলুন", body: "একই ইমেইল-পাসওয়ার্ডে সাইন ইন করে প্রোডাক্ট তুলুন, অর্ডার আসা শুরু।" },
  ],
  rider: [
    { title: "আবেদন জমা দিন", body: "ফর্ম পূরণ করলেই ইমেইল ও পাসওয়ার্ডে আপনার রাইডার লগইন তৈরি হয়ে যায়।" },
    { title: "অ্যাডমিন যাচাই", body: "টিম আপনার তথ্য যাচাই করে অনুমোদন দেয় — সাধারণত এক কর্মদিবসের মধ্যে।" },
    { title: "অনলাইন হোন", body: "একই ইমেইল-পাসওয়ার্ডে সাইন ইন করে অনলাইন করলেই ট্রিপের অনুরোধ আসবে।" },
  ],
};

/** "What happens next" — three numbered steps above the form. */
export function ApplySteps({ kind }: { kind: "vendor" | "rider" }) {
  return (
    <ol className="mt-6 grid gap-2 sm:grid-cols-3" aria-label="আবেদনের ধাপ">
      {STEPS[kind].map((step, i) => (
        <li
          key={step.title}
          className="flex gap-3 rounded-2xl bg-ivory-100/70 p-3.5 ring-1 ring-line sm:flex-col sm:gap-2"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-800 text-xs font-bold text-ivory-50"
          >
            {bnDigits(String(i + 1))}
          </span>
          <span>
            <span className="block text-sm font-semibold text-forest-900">{step.title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Numbered form section — a fieldset with a legend and a two-column grid. */
export function FormSection({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-3 w-full">
        <span className="flex items-center gap-2 text-sm font-semibold text-forest-900">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-100 text-[0.7rem] font-bold text-gold-800"
          >
            {bnDigits(String(step))}
          </span>
          {title}
        </span>
        {hint && <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{hint}</span>}
      </legend>
      <div className="clear-both grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Multi-select zone chips — real toggle buttons, thumb-sized. */
export function ZoneChips({
  zones,
  selected,
  onToggle,
}: {
  zones: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (zones.length === 0) {
    return (
      <p className="text-xs text-ink-soft sm:col-span-2">
        এলাকার তালিকা লোড হচ্ছে… না এলে ফর্ম জমা দিন, অ্যাডমিন এলাকা ঠিক করে দেবেন।
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 sm:col-span-2">
      {zones.map((z) => {
        const checked = selected.includes(z.id);
        return (
          <button
            type="button"
            key={z.id}
            aria-pressed={checked}
            onClick={() => onToggle(z.id)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500/50 ${
              checked
                ? "bg-forest-800 text-ivory-50 ring-1 ring-forest-800"
                : "bg-ivory-100 text-ink ring-1 ring-line hover:ring-line-strong"
            }`}
          >
            {checked ? `✓ ${z.name}` : z.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Error banner that pulls itself into view and takes focus, so a phone user
 * who tapped "submit" at the bottom of a long form actually sees why nothing
 * happened.
 */
export function FormAlert({ message }: { message: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!message || !el) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
    el.focus({ preventScroll: true });
  }, [message]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold leading-relaxed text-rose-800 ring-1 ring-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
    >
      {message}
    </div>
  );
}

/** "Already applied?" — the way back to the login page for returning applicants. */
export function AlreadyAppliedLink({ href }: { href: string }) {
  return (
    <p className="text-center text-sm text-ink">
      আগেই আবেদন করেছেন?{" "}
      <Link href={href} className="font-semibold text-forest-800 underline underline-offset-2">
        সাইন ইন করুন →
      </Link>
    </p>
  );
}
