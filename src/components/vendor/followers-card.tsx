"use client";

/**
 * B1 (2026-09-28) — the shop's followers, and who still needs a phone call.
 *
 * Presentational on purpose (same reason as ServiceScoreCard): the two honest
 * states — "nobody follows you yet" and "these numbers were never reached" —
 * must be assertable without rendering the dashboard. `neverReached` is not a
 * decoration: the push pipeline stores a follow even when the phone has no
 * notifications on, and those numbers exist nowhere else. The card is their
 * only home, so a zero-count list says so out loud instead of showing nothing.
 */

import { formatDateTime } from "@/components/vendor/vendor-ui";
import type { ShopFollower } from "@/lib/use-vendor";

export default function FollowersCard({
  followers,
  neverReached,
  rows = [],
  loading = false,
}: {
  followers: number;
  /** Phones no message has reached yet — the shop's call list. */
  neverReached: string[];
  rows?: ShopFollower[];
  loading?: boolean;
}) {
  const recent = rows.slice(0, 5);
  return (
    <section
      aria-label="Shop followers"
      className="mt-6 rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="shop-followers"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Followers
        </h3>
        <p className="text-[0.68rem] text-ink-soft">
          Shoppers who asked for new-piece news — nothing is estimated.
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-ink-soft">…</p>
      ) : (
        <>
          <p
            className="mt-3 font-display text-2xl text-forest-900"
            data-testid="followers-count"
          >
            {followers}
          </p>
          <p className="text-[0.68rem] text-ink-soft">
            {followers === 0
              ? "No followers yet — the card on your shop page is what collects them. Share your shop link."
              : followers === 1
                ? "1 shopper is watching your shelf."
                : `${followers} shoppers are watching your shelf.`}
          </p>

          {neverReached.length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200" data-testid="followers-call-list">
              <p className="text-xs font-semibold text-amber-900">
                Call these numbers — the app could not reach them
              </p>
              <p className="mt-1 text-[0.68rem] leading-5 text-amber-900/80">
                Their phone has PROSANTI notifications off, so a new product is
                a phone call, exactly the way orders are confirmed.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {neverReached.slice(0, 12).map((phone) => (
                  <li key={phone}>
                    <a
                      href={`tel:${phone}`}
                      className="inline-block rounded-full bg-paper px-3 py-1 text-xs font-semibold text-forest-800 ring-1 ring-amber-300"
                    >
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
              {neverReached.length > 12 && (
                <p className="mt-2 text-[0.68rem] text-amber-900/80">
                  +{neverReached.length - 12} more in the list
                </p>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <ul className="mt-4 space-y-1.5" data-testid="followers-recent">
              {recent.map((f) => (
                <li key={f.phone} className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="font-medium text-ink">{f.phone}</span>
                  <span className="text-ink-soft">
                    {f.lastNotifiedAt
                      ? `told about a new piece · ${formatDateTime(new Date(f.lastNotifiedAt).getTime())}`
                      : "not told yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
