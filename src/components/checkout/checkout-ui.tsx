"use client";

/**
 * Small presentational pieces for the three-step checkout (UX audit
 * 2026-09-18, P0 #1 / #3 / #6). No data fetching, no pricing — the view owns
 * state; these only paint it.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { IconArrowRight, IconCheck, IconChevron } from "@/components/ui/icons";
import type { FriendlyError } from "@/lib/checkout-errors";

/* ------------------------------------------------------------------ */
/* Progress — "ধাপ ১ / ৩"                                              */
/* ------------------------------------------------------------------ */

export function CheckoutProgress({
  current,
  labels,
  stepOf,
  onJump,
}: {
  /** 1-based step the shopper is on (first incomplete step). */
  current: 1 | 2 | 3;
  labels: [string, string, string];
  /** "Step {n} of 3" template. */
  stepOf: string;
  onJump: (step: 1 | 2 | 3) => void;
}) {
  return (
    <nav aria-label="Checkout progress" className="mb-8" data-testid="checkout-progress">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        {stepOf.replace("{n}", String(current))}
      </p>
      <ol className="mt-2 grid grid-cols-3 gap-2">
        {labels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className="min-w-0">
              <button
                type="button"
                onClick={() => onJump(n)}
                aria-current={active ? "step" : undefined}
                className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold ring-1 transition-colors ${
                  active
                    ? "bg-forest-800 text-ivory-50 ring-forest-700"
                    : done
                      ? "bg-forest-50 text-forest-900 ring-forest-200"
                      : "bg-paper text-ink-soft ring-line"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${
                    active
                      ? "bg-gold-400 text-forest-900"
                      : done
                        ? "bg-forest-700 text-ivory-50"
                        : "bg-ivory-100 text-ink-soft ring-1 ring-line"
                  }`}
                >
                  {done ? <IconCheck className="h-3.5 w-3.5 stroke-[3]" /> : n}
                </span>
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ivory-100">
        <div
          className="h-full rounded-full bg-forest-700 transition-[width] duration-300"
          style={{ width: `${((current - 1) / 3) * 100 + 20}%` }}
        />
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Step section heading                                                */
/* ------------------------------------------------------------------ */

export function StepSection({
  id,
  n,
  title,
  hint,
  done,
  children,
}: {
  id: string;
  n: number;
  title: string;
  hint?: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-28 rounded-3xl bg-paper p-5 ring-1 ring-line sm:p-7"
      data-step={n}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done ? "bg-forest-700 text-ivory-50" : "bg-gold-100 text-forest-900 ring-1 ring-gold-300"
          }`}
          aria-hidden="true"
        >
          {done ? <IconCheck className="h-4 w-4 stroke-[3]" /> : n}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="font-display text-xl font-medium text-forest-900">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* "আরও অপশন" accordion — content stays mounted (same <form>)          */
/* ------------------------------------------------------------------ */

export function MoreOptions({
  open,
  onToggle,
  title,
  hint,
  badge,
  children,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
  title: string;
  hint: string;
  /** e.g. "কুপন প্রয়োগ হয়েছে" — shows what is already set while collapsed. */
  badge?: string | null;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Keep the native element in step with React state (a click on <summary>
  // toggles the element before React sees the event).
  useEffect(() => {
    if (ref.current && ref.current.open !== open) ref.current.open = open;
  }, [open]);
  return (
    <details
      ref={ref}
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-3xl bg-paper ring-1 ring-line"
      data-testid="more-options"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden sm:px-7">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory-100 text-forest-800 ring-1 ring-line">
          <IconChevron className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-medium text-forest-900">{title}</span>
          <span className="block truncate text-xs text-ink-soft">{badge || hint}</span>
        </span>
      </summary>
      <div className="space-y-6 border-t border-line px-5 py-5 sm:px-7">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Error banner — Bangla first, English under it, one tap to the field */
/* ------------------------------------------------------------------ */

export function OrderErrorBanner({
  error,
  title,
  fixLabel,
  onFix,
  bannerRef,
}: {
  error: FriendlyError | null;
  title: string;
  fixLabel: string;
  onFix?: (() => void) | null;
  bannerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  if (!error) return null;
  return (
    <div
      ref={bannerRef}
      role="alert"
      aria-live="assertive"
      data-testid="order-error"
      className="scroll-mt-28 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-6 text-rose-900"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-rose-700">{title}</p>
      <p className="mt-1 font-semibold">{error.bn}</p>
      {error.en && error.en !== error.bn ? (
        <p className="mt-0.5 text-xs text-rose-800/80">{error.en}</p>
      ) : null}
      {onFix ? (
        <button
          type="button"
          onClick={onFix}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
        >
          {fixLabel} <IconArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sticky bottom bar — phones only, sits above the bottom nav          */
/* ------------------------------------------------------------------ */

export function StickyOrderBar({
  visible,
  totalLabel,
  total,
  ctaLabel,
  disabled,
  submitting,
  hint,
}: {
  visible: boolean;
  totalLabel: string;
  total: string;
  ctaLabel: string;
  disabled: boolean;
  submitting: boolean;
  /** One line under the total — the min-order shortfall or the ETA. */
  hint?: string | null;
}) {
  return (
    <div
      className="sticky-buy-bar border-t border-line bg-paper/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-paper/90"
      data-visible={visible}
      data-testid="sticky-order-bar"
      inert={!visible}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
            {totalLabel}
          </p>
          <p className="font-display text-xl leading-tight text-forest-900">{total}</p>
          {hint ? <p className="truncate text-[11px] text-ink-soft">{hint}</p> : null}
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-50"
        >
          {ctaLabel}
          {!submitting && <IconArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
