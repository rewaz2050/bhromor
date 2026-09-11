"use client";

/**
 * Rider shell + auth gate (marketplace phase 3, slice 7+).
 *
 * Live only: /rider/* opens solely for the authenticated linked rider
 * account; every /api/rider/* route re-verifies the session server-side.
 */

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import { useRiderSession } from "@/lib/use-rider";

export default function RiderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, error, signOut } = useRiderSession();
  const isLogin = pathname === "/rider/login";
  const isApply = pathname === "/rider/apply";

  useEffect(() => {
    if (!isLogin && !isApply && status === "guest") {
      router.replace("/rider/login");
    }
  }, [isLogin, isApply, status, router]);

  if (isLogin || isApply) return <>{children}</>;

  if (status === "checking") {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center" aria-label="Loading">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-line/70" />
        <p className="mt-4 text-sm text-ink-soft">রাইডার অ্যাকাউন্ট যাচাই হচ্ছে…</p>
      </div>
    );
  }

  if (status === "guest") {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-gold-300 ring-2 ring-gold-400/30">
          <LogoMark className="h-7 w-7" />
        </span>
        <h1 className="font-display mt-4 text-2xl font-bold text-forest-900">
          রাইডার লগইন প্রয়োজন
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {error ?? "এই পেইজ দেখতে রাইডার অ্যাকাউন্ট দিয়ে সাইন ইন করুন।"}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/rider/login"
            className="inline-flex h-11 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            লগইন করুন
          </Link>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-5 text-xs font-semibold text-ink-soft hover:bg-ivory-100"
          >
            স্টোরফ্রন্ট
          </button>
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          রাইডার হিসেবে এখনো রেজিস্টার করেননি?{" "}
          <Link href="/rider/apply" className="font-semibold text-forest-800 underline">
            এখানে আবেদন করুন
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory-50 text-ink antialiased">
      <div className="mx-auto max-w-md min-h-screen bg-paper shadow-lg ring-1 ring-line flex flex-col">
        {children}
      </div>
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full bg-forest-950 px-4 py-2 text-xs font-semibold text-ivory-50 shadow-lg hover:bg-forest-800"
        >
          সাইন আউট
        </button>
      </div>
    </div>
  );
}
