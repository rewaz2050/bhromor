"use client";

/**
 * B2 (2026-09-28) — "Reviews on your products", with the shop's own reply.
 *
 * Before this the shop could READ its reviews (RLS allowed it) and had no way
 * to answer on the page every future buyer reads. The card shows the ones the
 * customers can see, the unanswered ones first (oldest complaint first — it is
 * the loudest), and the reply box writes straight to the public review.
 *
 * The honest rules, all visible in the copy:
 *   • only approved reviews appear — a pending review belongs to staff;
 *   • one reply per review, and rewording it moves the "answered" stamp;
 *   • a failed save says so and keeps the typed text — never a silent loss.
 *
 * Presentational + plain props for the tests; the page passes the hook.
 */

import { useState } from "react";
import Link from "next/link";
import { REPLY_MAX, hasReply, replyBody, replyStamp, replySummary, sortForReply } from "@/lib/vendor-reply";
import type { VendorReviewRow } from "@/lib/use-vendor";
import { formatDateTime } from "@/components/vendor/vendor-ui";
import { IconStar } from "@/components/ui/icons";

const Stars = ({ value }: { value: number }) => (
  <span
    role="img"
    aria-label={`${value} out of 5 stars`}
    className="inline-flex items-center gap-0.5"
  >
    {[1, 2, 3, 4, 5].map((i) => (
      <IconStar
        key={i}
        className={`h-3.5 w-3.5 ${i <= Math.round(value) ? "text-gold-500" : "text-ivory-200"}`}
      />
    ))}
  </span>
);

function ReviewRow({
  review,
  onSave,
}: {
  review: VendorReviewRow;
  onSave: (id: string, text: string) => Promise<void>;
}) {
  const answered = hasReply(review);
  const [editing, setEditing] = useState(!answered);
  const [draft, setDraft] = useState(replyBody(review));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stamp = replyStamp(review);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(review.id, draft);
      setEditing(false);
    } catch (err) {
      // The typed words survive the failure — retry is one tap away.
      setError(err instanceof Error ? err.message : "Could not save the reply — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl bg-ivory-50 p-4 ring-1 ring-line" data-testid={`vendor-review-${review.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} />
        <span className="text-sm font-semibold text-ink">{review.author}</span>
        {review.verified && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-800">
            Verified
          </span>
        )}
        <span className="text-xs text-ink-soft">{formatDateTime(review.date)}</span>
        <span className="ml-auto text-xs font-medium text-forest-800" data-testid="review-product">
          {review.productSlug ? (
            <Link
              href={`/product/${encodeURIComponent(review.productSlug)}`}
              className="underline underline-offset-2"
            >
              {review.productName}
            </Link>
          ) : (
            review.productName
          )}
        </span>
      </div>

      {review.title && <p className="mt-2 text-sm font-semibold text-ink">{review.title}</p>}
      <p className="mt-1 text-sm leading-6 text-ink-soft">{review.body}</p>

      {review.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {review.photos.map((src, i) => (
            /* eslint-disable-next-line @next/next/no-img-element -- buyer photos may be data URLs and vendor-hosted Cloudinary URLs, neither is in next/image's allow-list */
            <img
              key={`${review.id}-photo-${i}`}
              src={src}
              alt={`Buyer photo on ${review.productName}`}
              className="h-16 w-16 rounded-lg object-cover ring-1 ring-line"
            />
          ))}
        </div>
      )}

      {answered && !editing && (
        <div className="mt-3 rounded-lg bg-forest-50 p-3 ring-1 ring-forest-100" data-testid="review-reply">
          <p className="text-xs font-semibold text-forest-900">
            Your reply{stamp ? ` · ${formatDateTime(stamp)}` : ""}
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">{replyBody(review)}</p>
          <button
            type="button"
            onClick={() => {
              setDraft(replyBody(review));
              setEditing(true);
            }}
            className="mt-2 text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            Reword
          </button>
        </div>
      )}

      {editing && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-ink-soft" htmlFor={`reply-${review.id}`}>
            Public reply — the customer and every future buyer can read it
          </label>
          <textarea
            id={`reply-${review.id}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            rows={3}
            maxLength={REPLY_MAX}
            placeholder="Thank you — and what you will do about it."
            data-testid="reply-box"
            className="mt-1 w-full rounded-xl bg-paper p-3 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || draft.trim().length < 3}
              data-testid="reply-save"
              className="rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-40"
            >
              {busy ? "Saving…" : answered ? "Save new wording" : "Post reply"}
            </button>
            {answered && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-ink-soft underline underline-offset-2"
              >
                Cancel
              </button>
            )}
            {error && (
              <span role="alert" className="text-xs font-medium text-red-700">
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function VendorReviewsCard({
  reviews,
  onReply,
  loading = false,
  limit,
  allHref,
  title = "Reviews on your products",
}: {
  reviews: VendorReviewRow[];
  /** The hook's writer; throws with a readable message when the save fails. */
  onReply: (id: string, reply: string) => Promise<VendorReviewRow>;
  loading?: boolean;
  /** Dashboard shows the first few; the full page passes no limit. */
  limit?: number;
  allHref?: string;
  title?: string;
}) {
  const [extra, setExtra] = useState<VendorReviewRow[]>([]);
  // Rows the card itself just answered stay visible even if the parent list
  // has not refreshed yet — the shop sees what it wrote.
  const merged = [...extra, ...reviews.filter((r) => !extra.some((e) => e.id === r.id))];
  const summary = replySummary(merged.map((r) => ({ rating: r.rating, vendorReply: r.vendorReply })));
  const ordered = sortForReply(merged);
  const shown = limit ? ordered.slice(0, limit) : ordered;

  return (
    <section
      aria-label="Reviews on your products"
      className="mt-6 rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="vendor-reviews"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">{title}</h3>
        <p className="text-[0.68rem] text-ink-soft">
          Approved reviews only — pending ones are with PROSANTI staff.
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-ink-soft">…</p>
      ) : merged.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft" data-testid="vendor-reviews-empty">
          No approved reviews yet. A review asks one question a shop can answer better than
          anyone: what did the person who bought this actually think?
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink" data-testid="vendor-reviews-summary">
            {summary.total} approved {summary.total === 1 ? "review" : "reviews"} ·{" "}
            {summary.replied} answered ·{" "}
            {summary.unanswered === 0 ? (
              "nothing waiting 🎉"
            ) : (
              <span className="font-semibold text-amber-800">
                {summary.unanswered} waiting
                {summary.unansweredRating !== null
                  ? ` (avg ${summary.unansweredRating.toFixed(1)}★)`
                  : ""}
              </span>
            )}
          </p>

          <ul className="mt-3 space-y-3">
            {shown.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                onSave={async (id, text) => {
                  const saved = await onReply(id, text);
                  // Keep the row's product name/photos: the API answers the
                  // review alone, the list already knows the rest.
                  const known = reviews.find((r) => r.id === id);
                  const updated = known
                    ? { ...known, ...saved, photos: known.photos }
                    : saved;
                  setExtra((list) => [
                    updated,
                    ...list.filter((e) => e.id !== id),
                  ]);
                }}
              />
            ))}
          </ul>

          {limit !== undefined && ordered.length > limit && (
            <p className="mt-3 text-xs text-ink-soft" data-testid="vendor-reviews-more">
              +{ordered.length - shown.length} more
              {allHref && (
                <>
                  {" · "}
                  <Link href={allHref} className="font-semibold text-forest-800 underline underline-offset-2">
                    See all reviews
                  </Link>
                </>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
