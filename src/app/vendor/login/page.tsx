"use client";

/**
 * Vendor sign-in + account creation (marketplace slice 3).
 * A fresh account has no shop link yet — /api/vendor/me answers 403 and
 * the page explains the next step (apply, then staff approval).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import { useVendorSession } from "@/lib/use-vendor";

export default function VendorLoginPage() {
  const router = useRouter();
  const { status, error, signIn, signUp } = useVendorSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authed") router.replace("/vendor");
  }, [status, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password needs at least 6 characters.");
      return;
    }
    setBusy(true);
    const problem =
      mode === "in"
        ? await signIn(email, password)
        : await signUp(email, password);
    setBusy(false);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (mode === "up") {
      setNotice(
        "Account created — now send a shop application (or ask PROSANTI to link your shop). You'll get in as soon as staff approves it.",
      );
    }
  };

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
      ) : (
        <form
          onSubmit={submit}
          className="mt-8 space-y-4 rounded-2xl bg-paper p-6 ring-1 ring-line"
        >
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-cream p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("in");
                setFormError(null);
              }}
              className={`rounded-lg px-3 py-2 ${mode === "in" ? "bg-white text-forest-900 shadow-sm" : "text-ink-soft"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("up");
                setFormError(null);
              }}
              className={`rounded-lg px-3 py-2 ${mode === "up" ? "bg-white text-forest-900 shadow-sm" : "text-ink-soft"}`}
            >
              Create account
            </button>
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}
          {notice && (
            <p className="rounded-xl bg-forest-50 px-4 py-3 text-sm text-forest-900 ring-1 ring-forest-200">
              {notice}
            </p>
          )}
          {error && mode === "in" && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              {error}
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
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600"
              placeholder="you@yourshop.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Password
            </span>
            <input
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-forest-800 px-4 py-3 text-sm font-semibold text-white hover:bg-forest-900 disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
          <p className="text-center text-xs text-ink-soft">
            New to PROSANTI? Create an account, then ask our team for a
            shop application — approval links your login automatically.
          </p>
        </form>
      )}
    </div>
  );
}
