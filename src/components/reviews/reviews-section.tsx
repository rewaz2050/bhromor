"use client";

import { formatShopDate } from "@/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePublicReviews } from "@/lib/use-public-reviews";
import { fitBadge, fitOptions, fitSummary, type FitKey } from "@/lib/review-fit";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  averageOf,
  visibleCount,
  visibleReviews,
} from "@/lib/review-store";
import type { Product } from "@/lib/catalog";
import { IconCheck, IconStar } from "@/components/ui/icons";
import { optimizedMediaUrl } from "@/lib/media-url";
import { compressReviewPhoto, MAX_PHOTOS } from "@/lib/review-photos";
import { readReviewProof } from "@/lib/review-proof";
import { hasReply, replyBody } from "@/lib/vendor-reply";
import { usePublicSettings } from "@/lib/use-public-settings";

const dayLabel = (ms: number): string =>
  formatShopDate(ms, { day: "numeric", month: "short", year: "numeric" });

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
  const { lang } = useLanguage();
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="group block shrink-0"
      aria-label={lang === "bn" ? `ক্রেতার ছবি খুলুন: ${alt}` : `Open buyer photo: ${alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image can't take data URLs */}
      <img
        src={optimizedMediaUrl(src, 400)}
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
  const { lang } = useLanguage();
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={lang === "bn" ? `৫-এর মধ্যে ${value} তারা` : `${value} out of 5 stars`}
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
  const { lang } = useLanguage();
  const copy = (en: string, bn: string) => lang === "bn" ? bn : en;
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Fit answer (fit-data pass): one tap, no thinking. The data the product
  // page's true-to-size bar has been waiting for.
  const [fit, setFit] = useState<FitKey | null>(null);
  const [sent, setSent] = useState<false | "plain" | "stamp">(false);
  const { settings: publicSettings } = usePublicSettings();
  const [error, setError] = useState<string | null>(null);
  // P1 #10 UGC: picked photos, compressed to the review JPEG budget in the
  // browser before submit.
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // `reviews` is null until the read answers — NOT "this product has none".
  // Showing the empty state in the meantime flashed "No written reviews yet"
  // at every shopper who had not noticed the fetch (flicker pass).
  const loaded = reviews !== null;
  const visible = visibleReviews(reviews ?? [], product.id);
  const count = visibleCount(reviews ?? [], product.id);
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
      setPhotoError(copy("Couldn't read that photo — try a JPG or PNG.", "ছবিটি পড়া যায়নি — JPG বা PNG দিয়ে আবার চেষ্টা করুন।"));
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

  /** Published fit answers, or null when there is not enough to say. */
  const fitStats = useMemo(() => fitSummary(reviews ?? [], lang), [reviews, lang]);

  const addReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return setError(copy("Pick a star rating first.", "আগে তারায় রেটিং দিন।"));
    if (body.trim().length < 10)
      return setError(copy("Tell us a little more — at least a sentence.", "আর একটু বলুন — অন্তত একটি বাক্য লিখুন।"));
    // Purchase proof stashed by the track page's "Review <piece>" link
    // (UX plan §4/§7, R10) → verified badge + a Smart Card stamp on approval.
    const proof = readReviewProof(product.id);
    void submit({
      productId: product.id,
      author: name.trim(),
      rating,
      title: title.trim() || undefined,
      body: body.trim(),
      photos: photos.length > 0 ? photos : undefined,
      orderId: proof?.orderId,
      phone: proof?.phone,
      fit: fit ?? undefined,
    }).then(({ ok, error: submitError, stampEligible }) => {
      if (!ok) {
        setError(submitError ?? copy("Could not save the review.", "রিভিউ জমা দেওয়া যায়নি — আবার চেষ্টা করুন।"));
        return;
      }
      setRating(0);
      setTitle("");
      setBody("");
      setPhotos([]);
      setFit(null);
      setSent(stampEligible && publicSettings.loyaltyEnabled ? "stamp" : "plain");
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
              {copy("Customer reviews", "ক্রেতাদের রিভিউ")}
            </h2>
            {count > 0 && (
              <p className="text-sm text-ink-soft">
                <span className="font-semibold text-ink">{avg.toFixed(1)}</span>{" "}
                {copy(`average from ${count} written review${count === 1 ? "" : "s"}`, `${count}টি রিভিউয়ের গড়`)}
              </p>
            )}
          </div>

          {/* Fit-data pass (2026-10-06): the number a cloth shop can show
              that a food app cannot — what real buyers said about the size.
              Nothing at all until enough approved answers exist. */}
          {fitStats ? (
            <div
              data-testid="fit-bar"
              className="mt-4 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
                  সাইজ কেমন পেয়েছেন / Fit
                </p>
                <p className="text-sm font-semibold text-forest-900">
                  {fitStats.label}
                </p>
              </div>
              <div
                className="mt-2 flex h-2 overflow-hidden rounded-full bg-ivory-200"
                role="img"
                aria-label={fitStats.label}
              >
                <span
                  className="bg-amber-400"
                  style={{
                    width: `${(fitStats.counts.small / fitStats.total) * 100}%`,
                  }}
                />
                <span
                  className="bg-forest-600"
                  style={{
                    width: `${(fitStats.counts.true / fitStats.total) * 100}%`,
                  }}
                />
                <span
                  className="bg-sky-400"
                  style={{
                    width: `${(fitStats.counts.large / fitStats.total) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-ink-soft">
                {fitStats.total} জনের মতামত · ছোট / ঠিক / বড়
              </p>
            </div>
          ) : null}

          {buyerPhotos.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                {copy("Real buyer photos", "ক্রেতাদের ছবি")}
              </p>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {buyerPhotos.map((src, i) => (
                  <BuyerPhoto key={`${src.slice(0, 48)}-${i}`} src={src} alt={`Photo from a customer review`} />
                ))}
              </div>
            </div>
          )}

          {loaded && visible.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-line bg-ivory-100/50 px-8 py-14 text-center">
              <p className="font-display text-xl text-forest-900">
                {copy("No written reviews yet", "এখনো কোনো রিভিউ নেই")}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">
                {copy("Be the first to share what you think — approved reviews appear here.", "পণ্যটি কেমন লেগেছে জানান — অনুমোদনের পর রিভিউ এখানে দেখা যাবে।")}
              </p>
            </div>
          ) : visible.length > 0 ? (
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
                          {copy("Featured", "বিশেষ রিভিউ")}
                        </span>
                      )}
                      {r.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-emerald-800">
                          <IconCheck className="h-3 w-3" /> {copy("Verified purchase", "যাচাইকৃত ক্রেতা")}
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
                    {/* One buyer's size answer, right where the next buyer
                        reads their words — the whole point of collecting it. */}
                    {r.fit ? (
                      <span
                        data-testid="review-fit-badge"
                        className="rounded-full bg-ivory-100 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-ink"
                      >
                        {fitBadge(r.fit, lang)}
                      </span>
                    ) : null}
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
                  {/* B2 — the shop's public answer, from /vendor. Shown to
                      every shopper: an answered complaint is evidence, not a
                      footnote, so it sits right under the review it answers. */}
                  {hasReply(r) && (
                    <div
                      className="mt-3 rounded-2xl bg-forest-50 p-4 ring-1 ring-forest-100"
                      data-testid="review-shop-reply"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-forest-800">
                        {copy("Response from the shop", "দোকানের উত্তর")}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-ink">{replyBody(r)}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Form */}
        <aside>
          <form
            onSubmit={addReview}
            className="sticky top-28 rounded-3xl bg-paper p-7 ring-1 ring-line"
          >
            <h3 className="font-display text-xl font-medium text-forest-900">
              {copy("Write a review", "আপনার রিভিউ লিখুন")}
            </h3>
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">
              {copy("Bought this from PROSANTI? Tell others about the fit, fabric and feel.", "পণ্যটি কিনেছেন? মাপ, কাপড় আর ব্যবহারের অভিজ্ঞতা জানান।")}
            </p>

            <div className="mt-5">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {copy("Your rating *", "আপনার রেটিং *")}
              </span>
              <div
                className="flex gap-1"
                role="radiogroup"
                aria-label={copy("Star rating", "তারায় রেটিং")}
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={rating === i}
                    aria-label={copy(`${i} star${i === 1 ? "" : "s"}`, `${i} তারা`)}
                    onClick={() => {
                      setRating(i);
                      setError(null);
                    }}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-ivory-100"
                  >
                    <IconStar
                      className={`h-6 w-6 ${i <= rating ? "text-gold-500" : "text-ivory-200"}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* One tap, no thinking: "will it fit me?" is the question every
                cloth buyer has and no description answers. */}
            <div className="mt-4">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {copy("How was the size?", "সাইজ কেমন পেয়েছেন?")}{" "}
                <span className="font-normal text-ink-soft">{copy("(optional)", "(ঐচ্ছিক)")}</span>
              </span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={copy("Fit", "মাপ")}>
                {fitOptions(lang).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={fit === option.key}
                    data-testid={`fit-option-${option.key}`}
                    onClick={() => setFit(option.key)}
                    className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
                      fit === option.key
                        ? "bg-forest-800 font-semibold text-ivory-50"
                        : "bg-paper text-ink ring-1 ring-line hover:ring-forest-400"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {fit ? (
                <p className="mt-1.5 text-[11px] text-ink-soft">
                  {copy("Your answer helps the next shopper choose their size.", "আপনার উত্তর পরের ক্রেতাকে সাইজ বেছে নিতে সাহায্য করবে।")}
                </p>
              ) : null}
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {copy("Name", "নাম")}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={copy("Your name", "আপনার নাম")}
                className="w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {copy("Title (optional)", "শিরোনাম (ঐচ্ছিক)")}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={copy("e.g. Excellent quality", "যেমন: কাপড়ের মান ভালো")}
                className="w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {copy("Your review *", "আপনার রিভিউ *")}
              </span>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (error) setError(null);
                }}
                rows={4}
                placeholder={copy("What did you like? How was the fit?", "কী ভালো লেগেছে? মাপ ঠিক ছিল?")}
                className="w-full resize-y rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-600"
              />
            </label>

            <div className="mt-3">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                {copy("Your photos (optional)", "আপনার ছবি (ঐচ্ছিক)")}
              </span>
              <p className="mb-2 text-[0.68rem] leading-4 text-ink-soft">
                {copy(`Add up to ${MAX_PHOTOS} photos to help other shoppers see the fit. Photos are compressed before upload.`, `অন্য ক্রেতাদের মাপ বুঝতে সাহায্য করতে সর্বোচ্চ ${MAX_PHOTOS}টি ছবি দিন। আপলোডের আগে ছবির আকার ছোট করা হয়।`)}
              </p>
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ivory-100 px-4 py-2 text-xs font-semibold text-ink ring-1 ring-line transition-colors hover:bg-ivory-200 disabled:opacity-60"
                >
                  {photoBusy ? copy("Reading photo…", "ছবি প্রস্তুত হচ্ছে…") : copy("+ Add photo", "+ ছবি যোগ করুন")}
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                aria-label={copy("Add review photos", "রিভিউয়ের ছবি যোগ করুন")}
                onChange={(e) => void addPhotoFiles(e.target.files)}
              />
              {photos.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {photos.map((src, i) => (
                    <li key={`${i}-${src.length}`} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- next/image can't take data URLs */}
                      <img
                        src={optimizedMediaUrl(src, 200)}
                        alt={`Review photo ${i + 1}`}
                        className="h-16 w-16 rounded-xl object-cover ring-1 ring-line"
                      />
                      <button
                        type="button"
                        aria-label={copy(`Remove photo ${i + 1}`, `${i + 1} নম্বর ছবি সরান`)}
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
                {copy("Thanks! Your review is awaiting moderation and will appear once approved.", "ধন্যবাদ! যাচাই ও অনুমোদনের পর আপনার রিভিউ দেখা যাবে।")}
                {sent === "stamp" ? (
                  <span className="mt-1 block" data-testid="review-stamp-promise">
                    {copy("Verified purchase — once approved, 1 stamp lands on your Smart Card.", "যাচাইকৃত ক্রয় — অনুমোদনের পর স্মার্ট কার্ডে ১টি স্ট্যাম্প যোগ হবে।")}
                  </span>
                ) : null}
              </p>
            )}

            <button
              type="submit"
              className="mt-5 w-full rounded-full bg-forest-800 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
            >
              {copy("Submit review", "রিভিউ জমা দিন")}
            </button>
            <p className="mt-3 text-center text-[0.68rem] leading-4 text-ink-soft">
              {copy("Reviews are checked before publishing. A verified-purchase badge means the review matches an order.", "প্রকাশের আগে রিভিউ যাচাই করা হয়। অর্ডারের সাথে মিলে গেলেই যাচাইকৃত ক্রেতার ব্যাজ দেওয়া হয়।")}
            </p>
          </form>
        </aside>
      </div>
    </section>
  );
}
