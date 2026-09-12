"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ADMIN_LOGIN_PATH, signOutAdmin } from "@/lib/admin-auth";

/** Keep an admin render failure recoverable instead of falling through to
 * Next's generic "This page couldn't load" screen. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin page failed to render", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl bg-paper p-8 text-center shadow-sm ring-1 ring-line">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">
          Admin dashboard
        </p>
        <h2 className="mt-3 font-display text-2xl font-medium text-forest-900">
          The dashboard could not load
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          A data item may be incomplete or the connection may have dropped.
          Try loading the dashboard again. If the problem continues, sign in
          again to refresh the staff session.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-forest-800 px-6 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
          >
            Try again
          </button>
          <Link
            href={ADMIN_LOGIN_PATH}
            onClick={() => signOutAdmin()}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
          >
            Sign in again
          </Link>
        </div>
      </div>
    </div>
  );
}
