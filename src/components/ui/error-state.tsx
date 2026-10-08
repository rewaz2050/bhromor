"use client";

/**
 * One recoverable error screen, shared by every surface that had none.
 *
 * Before this (scan 2026-10-08) only `/admin` had an error boundary: a thrown
 * server error on the storefront, in the rider app or in the vendor app fell
 * through to Next's bare production page — no header, no footer, no way back,
 * on a phone in the middle of a delivery.
 *
 * Bilingual like the rest of the shopfront: the copy is written here rather
 * than pulled from `translations.ts` because an error boundary must render
 * even when the provider above it is the thing that broke.
 */

import Link from "next/link";

export interface ErrorStateProps {
  /** What failed — "this page", "the rider board", … */
  title?: string;
  titleBn?: string;
  /** Where "go back" should point. Defaults to the shop. */
  homeHref?: string;
  homeLabel?: string;
  homeLabelBn?: string;
  /** Called by the "Try again" button: re-renders the failed segment. */
  onRetry?: () => void;
  /** Logged once per failure; never shown to the shopper. */
  error?: Error & { digest?: string };
}

export default function ErrorState({
  title = "This page could not load",
  titleBn = "এই পাতাটি লোড হয়নি",
  homeHref = "/",
  homeLabel = "Back to the shop",
  homeLabelBn = "দোকানে ফিরে যান",
  onRetry,
  error,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center"
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
        <span lang="en">Error</span>
      </p>
      <h1 className="mt-3 font-display text-2xl font-medium text-forest-900">
        <span lang="en">{title}</span>
        <span className="mt-1 block text-xl text-ink-soft" lang="bn">
          {titleBn}
        </span>
      </h1>
      <p className="mt-4 text-sm leading-6 text-ink-soft">
        <span lang="en">
          Something went wrong on our side. Your bag and your orders are safe —
          nothing was lost. Trying again usually fixes it.
        </span>
        <span className="mt-2 block" lang="bn">
          আমাদের দিক থেকে সমস্যা হয়েছে। আপনার ব্যাগ ও অর্ডার নিরাপদ আছে — কিছুই
          হারায়নি। আবার চেষ্টা করলে সাধারণত ঠিক হয়ে যায়।
        </span>
      </p>
      {error?.digest && (
        <p className="mt-3 text-[0.7rem] tabular-nums text-ink-soft/70">
          <span lang="en">Reference: {error.digest}</span>
        </p>
      )}
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
          >
            <span lang="en">Try again</span>
            <span className="ml-1.5" lang="bn">
              (আবার চেষ্টা)
            </span>
          </button>
        )}
        <Link
          href={homeHref}
          className="inline-flex min-h-11 items-center rounded-full px-6 py-2.5 text-sm font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
        >
          <span lang="en">{homeLabel}</span>
          <span className="ml-1.5" lang="bn">
            ({homeLabelBn})
          </span>
        </Link>
      </div>
    </div>
  );
}
