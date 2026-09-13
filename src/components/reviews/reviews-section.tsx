"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicReviews } from "@/lib/use-public-reviews";
import {
  averageOf,
  visibleCount,
  visibleReviews,
} from "@/lib/review-store";
import type { Product } from "@/lib/catalog";
import { IconCheck, IconStar } from "@/components/ui/icons";
import { compressReviewPhoto, MAX_PHOTOS } from "@/lib/review-photos";

const dayLabel = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Plain <img>: next/image can't take data URLs, and buyer photos at launch
 *  scale are compressed JPEGs — either a data URL or a Cloudinary URL. */
function BuyerPhoto({
  src,
  alt,
  className = "h-24 w-24",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="group block shrink-0"
      aria-label={`Open buyer photo: ${alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image can't take data URLs */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`${className} rounded-2xl object-cover ring-1 ring-line transition-transform group-hover:scale-[1.03]`}
      />
    </a>
  );
}

function Stars({
  value,
  className = "h-4 w-4",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <IconStar
          key={i}
          className={`${className} ${
            i <= Math.round(value) ? "text-gold-500" : "text-ivory-200"
          }`}
        />
      ))}
    </span>
  );
}

/** §30 customer reviews — approved entries + submission form (moderated). */
export default function ReviewsSection({ product }: { product: Product }) {
  const { reviews, submit } = usePublicReviews({ product: product.id });
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // P1 #10 UGC: picked photos, compressed to the review JPEG budget in the
  // browser before submit.
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const visible = visibleReviews(reviews, product.id);
  const count = visibleCount(reviews, product.id);
  const avg = averageOf(visible);
  /** All photos across this product's approved reviews, review order kept. */
  const buyerPhotos = visible.flatMap((r) => r.photos ?? []);

  const addPhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setPhotoError(`Up to ${MAX_PHOTOS} photos per review.`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    setPhotoBusy(true);
    setPhotoError(null);
    const added: string[] = [];
    let failed = 0;
    for (const file of chosen) {
      const compressed = await compressReviewPhoto(file);
      if (compressed) added.push(compressed.dataUrl);
      else failed += 1;
    }
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    setPhotoBusy(false);
    if (added.length === 0 && failed > 0) {
      setPhotoError("Couldn't read that photo — try a JPG or PNG.");
    } else if (files.length > room && added.length + photos.length >= MAX_PHOTOS) {
      setPhotoError(`Only the first ${MAX_PHOTOS} photos were kept.`);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const sentTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
    },
    [],
  );

  const addReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return setError("Pick a star rating first.");
    if (body.trim().length < 10)
      return setError("Tell us a little more — at least a sentence.");
    void submit({
      productId: product.id,
      author: name.trim(),
      rating,
      title: title.trim() || undefined,
      body: body.trim(),
      photos: photos.length > 0 ? photos : undefined,
    }).then(({ ok, error: submitError }) => {
      if (!ok) {
        setError(submitError ?? "Could not save the review.");
        return;
      }
      setRating(0);
      setTitle("");
      setBody("");
      setPhotos([]);
      setSent(true);
      setError(null);
      if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
      sentTimer.current = window.setTimeout(() => setSent(false), 5000);
    });
  };

  return (
    <section
      className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"
      aria-labelledby="reviews-heading"
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
        {/* List */}
        <div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2
              id="reviews-heading"
              className="font-display text-3xl font-medium tracking-tight text-forest-900"
            >
              Customer reviews
            </h2>
            {count > 0 && (
              <p className="text-sm text-ink-soft">
                <span className="font-semibold text-ink">{avg.toFixed(1)}</span>{" "}
                average from {count} written review{count === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {buyerPhotos.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Real buyer photos
              </p>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {buyerPhotos.map((src, i) => (
                  <BuyerPhoto key={`${src.slice(0, 48)}-${i}`} src={src} alt={`Photo from a customer review`} />
                ))}
              </div>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 py-14 text-center">
              <p className="font-display text-xl text-forest-900">
                No written reviews yet
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">
                Be the first to share what you think — approved reviews appear
                here.
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-5">
              {visible.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-3xl p-6 ring-1 ${r.featured ? "bg-gold-100/50 ring-gold-300" : "bg-paper ring-line"}`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 text-sm font-semibold text-ivory-50">
                      {r.author.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {r.author}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {dayLabel(r.date)}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {r.featured && (
                        <span className="rounded-full bg-gold-700 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-white">
                          Featured
                        </span>
                      )}
                      {r.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-emerald-800">
                          <IconCheck className="h-3 w-3" /> Verified purchase
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Stars value={r.rating} />
                    {r.title && (
                      <p className="text-sm font-semibold text-ink">
                        {r.title}
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-ink-soft">
                    {r.body}
                  </p>
                  {(r.photos ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(r.photos ?? []).map((src, i) => (
                        <BuyerPhoto
                          key={`${r.id}-${i}`}
                          src={src}
                          alt={`Photo by ${r.author}`}
                          className="h-20 w-20"
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Form */}
        <aside>
          <form
            onSubmit={addReview}
            className="sticky top-28 rounded-3xl bg-paper p-7 ring-1 ring-line"
          >
            <h3 className="font-display text-xl font-medium text-forest-900">
              Write a review
            </h3>
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">
              Bought this from PROSANTI? Tell others about the fit, fabric and
              feel.
            </p>

            <div className="mt-5">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Your rating *
              </span>
              <div
                className="flex gap-1"
                role="radiogroup"
                aria-label="Star rating"
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={rating === i}
                    aria-label={`${i} star${i === 1 ? "" : "s"}`}
                    onClick={() => {
                      setRating(i);
                      setError(null);
                    }}
                    className="rounded-lg p-1 transition-transform hover:scale-110"
                  >
                    <IconStar
                      className={`h-6 w-6 ${i <= rating ? "text-gold-500" : "text-ivory-200"}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Title (optional)
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Excellent quality"
                className="w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Your review *
              </span>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (error) setError(null);
                }}
                rows={4}
                placeholder="What did you like? How was the fit?"
                className="w-full resize-y rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
            </label>

            <div className="mt-3">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Your photos (optional)
              </span>
              <p className="mb-2 text-[0.68rem] leading-4 text-ink-soft">
                Up to {MAX_PHOTOS} photos of the garment on you — the best fit
                guide there is. Photos are compressed on your phone before
                upload.
              </p>
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ivory-100 px-4 py-2 text-xs font-semibold text-ink ring-1 ring-line transition-colors hover:bg-ivory-200 disabled:opacity-60"
                >
                  {photoBusy ? "Reading photo…" : "+ Add photo"}
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                aria-label="Add review photos"
                onChange={(e) => void addPhotoFiles(e.target.files)}
              />
              {photos.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {photos.map((src, i) => (
                    <li key={`${i}-${src.length}`} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- next/image can't take data URLs */}
                      <img
                        src={src}
                        alt={`Review photo ${i + 1}`}
                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-line"
                      />
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() =>
                          setPhotos((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-forest-800 text-[0.6rem] font-bold text-white"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {photoError && (
                <p role="alert" className="mt-2 text-xs font-medium text-rose-800">
                  {photoError}
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200"
              >
                {error}
              </p>
            )}
            {sent && (
              <p
                role="status"
                className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200"
              >
                Thanks! Your review is awaiting moderation and will appear once
                approved.
              </p>
            )}

            <button
              type="submit"
              className="mt-5 w-full rounded-full bg-forest-800 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
            >
              Submit review
            </button>
            <p className="mt-3 text-center text-[0.68rem] leading-4 text-ink-soft">
              Reviews are checked before publishing (§30). Verified-purchase
              badges only appear where a matching order exists.
            </p>
          </form>
        </aside>
      </div>
    </section>
  );
}
