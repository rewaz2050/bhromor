"use client";

/**
 * Rider shell + auth gate (marketplace phase 3, slice 7+).
 *
 * Live only: /rider/* opens solely for the authenticated linked rider
 * account; every /api/rider/* route re-verifies the session server-side.
 *
 * 2026-09-25: "guest" now means strictly "no Supabase session". A signed-in
 * account that is pending approval, suspended, or owns no rider row gets its
 * OWN screen here instead of a bounce to /rider/login — the old gate treated
 * every 403 as "guest", so a fresh applicant looped /rider ↔ /rider/login
 * forever ("account open kora jacche na").
 */

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import { useRiderSession } from "@/lib/use-rider";

function GateCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-gold-300 ring-2 ring-gold-400/30">
        <LogoMark className="h-7 w-7" />
      </span>
      <h1 className="font-display mt-4 text-2xl font-bold text-forest-900">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>
    </div>
  );
}

const primaryBtn =
  "inline-flex h-11 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 hover:bg-forest-900";
const ghostBtn =
  "inline-flex h-11 items-center rounded-full border border-line bg-paper px-5 text-xs font-semibold text-ink-soft hover:bg-ivory-100";

export default function RiderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, rider, email, error, refresh, signOut } = useRiderSession();
  const isLogin = pathname === "/rider/login";
  const isApply = pathname === "/rider/apply";

  useEffect(() => {
    // Only a truly signed-out visitor is bounced. Pending / suspended /
    // no-rider accounts stay on /rider and see their own status card below.
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
      <GateCard
        title="রাইডার লগইন প্রয়োজন"
        body={error ?? "এই পেইজ দেখতে রাইডার অ্যাকাউন্ট দিয়ে সাইন ইন করুন।"}
      >
        <Link href="/rider/login" className={primaryBtn}>
          লগইন করুন
        </Link>
        <button type="button" onClick={() => router.replace("/")} className={ghostBtn}>
          স্টোরফ্রন্ট
        </button>
        <p className="w-full text-xs text-ink-soft">
          রাইডার হিসেবে এখনো রেজিস্টার করেননি?{" "}
          <Link href="/rider/apply" className="font-semibold text-forest-800 underline">
            এখানে আবেদন করুন
          </Link>
        </p>
      </GateCard>
    );
  }

  if (status === "pending") {
    return (
      <GateCard
        title="আবেদন যাচাই চলছে ⏳"
        body={`ধন্যবাদ${rider?.name ? ` ${rider.name}` : ""}! আপনার রাইডার আবেদনটি আমাদের কাছে পৌঁছেছে। তথ্য যাচাই করে অ্যাডমিন অনুমোদন করলেই ড্যাশবোর্ড খুলে যাবে — সাধারণত ২৪ ঘণ্টার মধ্যে ফোনে জানিয়ে দেওয়া হয়।`}
      >
        <button type="button" onClick={() => void refresh()} className={primaryBtn}>
          আবার চেক করুন
        </button>
        <button type="button" onClick={() => void signOut()} className={ghostBtn}>
          সাইন আউট
        </button>
        {email ? (
          <p className="w-full text-[11px] text-ink-soft">লগইন: {email}</p>
        ) : null}
      </GateCard>
    );
  }

  if (status === "suspended") {
    return (
      <GateCard
        title="অ্যাকাউন্ট স্থগিত"
        body="আপনার রাইডার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে। বিস্তারিত জানতে PROSANTI সাপোর্টে যোগাযোগ করুন।"
      >
        <Link href="/" className={primaryBtn}>
          স্টোরফ্রন্টে যান
        </Link>
        <button type="button" onClick={() => void signOut()} className={ghostBtn}>
          সাইন আউট
        </button>
      </GateCard>
    );
  }

  if (status === "norider") {
    return (
      <GateCard
        title="রাইডার আবেদন পাওয়া যায়নি"
        body={
          error ??
          "এই লগইন দিয়ে কোনো রাইডার আবেদন নেই। আবেদনের সময় যে ইমেইল দিয়েছিলেন, সেই ইমেইলেই লগইন করুন — অথবা নতুন করে আবেদন করুন।"
        }
      >
        <Link
          href={email ? `/rider/apply?email=${encodeURIComponent(email)}` : "/rider/apply"}
          className={primaryBtn}
        >
          রাইডার আবেদন করুন
        </Link>
        <button type="button" onClick={() => void signOut()} className={ghostBtn}>
          সাইন আউট
        </button>
      </GateCard>
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
