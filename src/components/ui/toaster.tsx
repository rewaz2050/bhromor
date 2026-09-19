"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  dismissToast,
  getToast,
  getToastServer,
  subscribeToast,
} from "@/lib/toast";
import { IconArrowRight, IconCheck, IconClose } from "@/components/ui/icons";

/**
 * The single surface that renders the app's toasts (Batch N).
 *
 * Placed once in the storefront layout. It sits above the bottom nav on
 * phones and out of the way of the bag drawer's close button on desktop, and
 * it never intercepts a tap: the message is a statement, the optional action
 * is the only clickable part.
 */
export default function Toaster() {
  const toast = useSyncExternalStore(subscribeToast, getToast, getToastServer);

  /* Escape dismisses, like every other transient surface in the app. */
  useEffect(() => {
    if (!toast) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissToast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  if (!toast) return null;

  const tone =
    toast.tone === "warn"
      ? "bg-gold-100 text-gold-700 ring-gold-200"
      : toast.tone === "info"
        ? "bg-forest-100 text-forest-900 ring-forest-200"
        : "bg-forest-900 text-ivory-50 ring-forest-700";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-[85] flex justify-center px-4 sm:bottom-6 sm:justify-start sm:px-6"
      data-testid="toaster"
    >
      <div
        role="status"
        aria-live="polite"
        data-tone={toast.tone}
        className={`pointer-events-auto flex max-w-[min(30rem,100%)] items-center gap-3 rounded-full py-2.5 pl-4 pr-2 text-sm shadow-lg ring-1 ${tone} toast-enter`}
      >
        {toast.tone === "success" ? (
          <IconCheck className="h-4 w-4 shrink-0 text-gold-300" />
        ) : null}
        <span className="min-w-0 truncate">{toast.message}</span>
        {toast.action ? (
          <Link
            href={toast.action.href}
            onClick={() => dismissToast()}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold underline underline-offset-4"
          >
            {toast.action.label}
            <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => dismissToast()}
          aria-label="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
