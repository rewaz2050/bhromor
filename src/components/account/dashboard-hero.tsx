"use client";

/**
 * The dashboard hero — the identity block that used to sit at the BOTTOM of
 * a long card stack (name, phone, logout were easy to lose). Now it anchors
 * the page: greeting, membership chip, one-tap track of the last order on
 * this device, the wishlist, and sign-out. One light membership read; the
 * chip simply hides when the store can't answer.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { readLastOrder } from "@/lib/last-order";
import {
  IconClock,
  IconStar,
  IconUser,
} from "@/components/ui/icons";

export interface HeroCustomer {
  id: string;
  name: string;
  phone: string;
}

type PlusState = "none" | "pending" | "active" | "expired" | "rejected";

export default function DashboardHero({
  customer,
  wishlistCount,
  done,
  busy,
  onSignOut,
}: {
  customer: HeroCustomer;
  wishlistCount: number;
  /** Auth success line from the view — announced once, then lives here. */
  done: string;
  busy: boolean;
  onSignOut: () => void;
}) {
  const { t } = useLanguage();
  const [plus, setPlus] = useState<PlusState>("none");
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  useEffect(() => {
    // Membership chip — best effort; hide on any failure.
    let live = true;
    fetch(`/api/membership?phone=${encodeURIComponent(customer.phone)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: PlusState } | null) => {
        if (live && d?.state) setPlus(d.state);
      })
      .catch(() => undefined);
    // Last order shortcut — localStorage only, a week shelf life.
    const last = readLastOrder();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage read must follow mount (SSR-safe)
    if (last) setLastOrderId(last.id);
    return () => {
      live = false;
    };
  }, [customer.phone]);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-forest-950 via-forest-900 to-forest-800 p-6 text-ivory-50 shadow-sm sm:p-8"
      data-testid="account-hero"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-400/15 blur-3xl"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">
            {t("accountHero.signedIn")}
          </p>
          <h2
            className="mt-1.5 break-words font-display text-2xl text-ivory-50 sm:text-3xl"
            data-testid="account-hero-name"
          >
            {t("accountHero.welcome")} {customer.name}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ivory-200">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ivory-50/10 px-3 py-1 ring-1 ring-ivory-50/20">
              <IconUser className="h-3.5 w-3.5" />
              {customer.phone}
            </span>
            {(plus === "active" || plus === "pending") && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ${
                  plus === "active"
                    ? "bg-gold-400/20 text-gold-200 ring-gold-300/40"
                    : "bg-ivory-50/10 text-ivory-200 ring-ivory-50/20"
                }`}
                data-testid="account-hero-plus"
              >
                <IconStar className="h-3.5 w-3.5" />
                {plus === "active"
                  ? t("accountHero.plusActive")
                  : t("accountHero.plusPending")}
              </span>
            )}
          </p>
          {done ? (
            <p role="status" className="mt-3 text-sm text-gold-200">
              {done}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {lastOrderId ? (
            <Link
              href={`/track?id=${encodeURIComponent(lastOrderId)}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gold-400 px-5 text-sm font-semibold text-forest-950 transition-colors hover:bg-gold-300"
              data-testid="account-hero-track"
            >
              <IconClock className="h-4 w-4" />
              {t("accountHero.trackLast")} →
            </Link>
          ) : null}
          <Link
            href="/wishlist"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ivory-50/10 px-5 text-sm font-medium text-ivory-50 ring-1 ring-ivory-50/25 transition-colors hover:bg-ivory-50/20"
          >
            {t("accountHero.wishlist")} ({wishlistCount})
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={onSignOut}
            className="min-h-9 text-xs text-ivory-200 underline underline-offset-2 disabled:opacity-40"
          >
            {busy ? t("accountHero.signingOut") : t("accountHero.signOut")}
          </button>
        </div>
      </div>
      <p className="mt-4 border-t border-ivory-50/15 pt-3 text-xs text-ivory-200/90">
        {t("accountHero.stampNote")}
      </p>
    </section>
  );
}
