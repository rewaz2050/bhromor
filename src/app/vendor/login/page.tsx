"use client";

/**
 * Vendor sign-in (marketplace slice 3; 2026-09-26 apply = sign up).
 *
 * There is no separate "create account" step any more: the shop
 * application form sets the email + password, and PROSANTI's approval is
 * what opens the dashboard. So this page only signs in — and when the
 * login exists but the API still refuses it (403), it shows the status
 * ("awaiting approval", "suspended", "no shop yet") with the next step
 * instead of a blank form that would bounce forever.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import { useVendorSession } from "@/lib/use-vendor";
import PasswordInput from "@/components/ui/password-input";
import { usePoll } from "@/lib/use-poll";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600";
const primaryClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-forest-800 px-4 py-3 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60";
const secondaryClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-forest-900 ring-1 ring-line hover:bg-cream";

/** Pending-approval re-check cadence (visible tab only). */
const PENDING_RECHECK_MS = 30_000;

export default function VendorLoginPage() {
  const router = useRouter();
  const { status, error, denyReason, refresh, signIn, signOut } =
    useVendorSession();
  // Apply = sign up: a pending applicant usually leaves this tab open, so
  // re-check every 30 s while visible and send them in the moment staff approves.
  usePoll(refresh, PENDING_RECHECK_MS, status === "guest" && denyReason === "pending");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authed") router.replace("/vendor");
  }, [status, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password needs at least 6 characters.");
      return;
    }
    setBusy(true);
    const problem = await signIn(email, password);
    setBusy(false);
    if (problem) {
      setFormError(
        `${problem} Use the email and password from your shop application.`,
      );
    }
  };

  const denied = status === "guest" && error !== null;

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-3 font-display text-2xl text-forest-900">
          Vendor dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Orders, products, hours and earnings for your shop.
        </p>
      </div>

      {status === "checking" ? (
        <div className="mt-8 h-64 animate-pulse rounded-2xl bg-line/60" aria-label="Loading" />
      ) : denied ? (
        <section
          aria-labelledby="vendor-status-heading"
          className="mt-8 space-y-4 rounded-2xl bg-paper p-6 ring-1 ring-line"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700">
            {denyReason === "pending"
              ? "Application received"
              : denyReason === "suspended"
                ? "Shop suspended"
                : "No shop on this login"}
          </p>
          <h2 id="vendor-status-heading" className="font-display text-xl text-forest-900">
            {denyReason === "pending"
              ? "Awaiting PROSANTI's approval"
              : denyReason === "suspended"
                ? "This shop is suspended"
                : "Send a shop application"}
          </h2>
          <p
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ring-1 ${
              denyReason === "pending"
                ? "bg-amber-50 text-amber-900 ring-amber-200"
                : "bg-rose-50 text-rose-800 ring-rose-200"
            }`}
          >
            {error}
          </p>
          {denyReason === "pending" && (
            <p className="text-sm text-ink-soft">
              You are signed in. Our team reviews every application by hand;
              the moment it is confirmed, this same email and password open
              the dashboard. This page re-checks every 30 seconds while it is
              open — or tap “Check again”.
            </p>
          )}
          {denyReason === "none" && (
            <Link href="/shops/apply" className={primaryClass}>
              Apply to sell on PROSANTI →
            </Link>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className={secondaryClass}
            >
              Check again
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className={secondaryClass}
            >
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={submit}
          className="mt-8 space-y-4 rounded-2xl bg-paper p-6 ring-1 ring-line"
        >
          <h2 className="font-display text-lg text-forest-900">Sign in</h2>
          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@yourshop.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Password
            </span>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </label>
          <button type="submit" disabled={busy} className={primaryClass}>
            {busy ? "Please wait…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-ink-soft">
            Use the email and password from your shop application — the
            dashboard opens once PROSANTI approves it. Forgot the password?
            Message support: staff issue a temporary one you change in
            Settings.
          </p>
          <p className="border-t border-line pt-4 text-center text-sm text-ink">
            New shop?{" "}
            <Link
              href="/shops/apply"
              className="font-semibold text-forest-800 underline-offset-4 hover:underline"
            >
              Apply to sell on PROSANTI →
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
