"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import { DEMO_ADMIN, isAdminAuthed, signInAdmin } from "@/lib/admin-auth";
import { IconCheck } from "@/components/ui/icons";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    if (isAdminAuthed()) router.replace("/admin");
  }, [router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Small delay so the demo reads like a real auth round-trip.
    window.setTimeout(() => {
      if (signInAdmin(email, password)) {
        router.replace("/admin");
      } else {
        setError("Incorrect email or password. Try the demo credentials below.");
        setBusy(false);
      }
    }, 450);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest-950 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ivory-100 shadow-lg">
            <LogoMark className="h-10 w-auto" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-medium tracking-wide text-ivory-50">
              PROSANTI Admin
            </h1>
            <p className="mt-1 text-sm text-ivory-100/60">
              Operations dashboard — staff only
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-3xl bg-ivory-50 p-7 shadow-2xl"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-forest-600"
              placeholder="admin@prosanti.store"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-forest-600"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-gold-100 px-4 py-2.5 text-sm leading-6 text-gold-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-full bg-forest-800 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-xs leading-5 text-ivory-100/70">
          <p className="flex items-center gap-1.5 font-semibold text-gold-300">
            <IconCheck className="h-3.5 w-3.5" /> Demo mode
          </p>
          <p className="mt-1.5">
            Email: <span className="text-ivory-50">{DEMO_ADMIN.email}</span>
            <br />
            Password: <span className="text-ivory-50">{DEMO_ADMIN.password}</span>
          </p>
          <p className="mt-2 text-ivory-100/50">
            Session lives in this browser only — real authentication arrives
            with the Supabase phase (§47).
          </p>
        </div>
      </div>
    </div>
  );
}
