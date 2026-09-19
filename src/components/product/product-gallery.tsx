"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconPlus } from "@/components/ui/icons";
import GalleryLightbox from "./gallery-lightbox";
import { useProductCoverFlight } from "./card-flight";
import {
  driveThumbnailUrl,
  extractDriveFileId,
  isDrivePreviewUrl,
  youtubeEmbedUrl,
  youtubeThumbUrl,
} from "@/lib/media";

type Slide =
  | { key: string; kind: "image"; src: string; alt: string }
  | { key: string; kind: "video"; src: string; alt: string }
  | { key: string; kind: "drive"; src: string; alt: string; fileId: string }
  | { key: string; kind: "youtube"; videoId: string; label: string };

const slidesOf = (product: Product): Slide[] => {
  const slides: Slide[] = product.media.map((m, i) => {
    if ((m.kind ?? "image") === "video") {
      if (isDrivePreviewUrl(m.src)) {
        const fileId = extractDriveFileId(m.src);
        if (fileId) {
          return {
            key: `drive-${i}`,
            kind: "drive",
            src: m.src,
            alt: m.alt || product.name,
            fileId,
          } satisfies Slide;
        }
      }
      return {
        key: `video-${i}`,
        kind: "video",
        src: m.src,
        alt: m.alt || product.name,
      } satisfies Slide;
    }
    return {
      key: `img-${i}`,
      kind: "image",
      src: m.src,
      alt: m.alt || product.name,
    } satisfies Slide;
  });
  if (product.video) {
    slides.push({
      key: `yt-${product.video.youtubeId}`,
      kind: "youtube",
      videoId: product.video.youtubeId,
      label: product.video.label,
    });
  }
  return slides;
};

/** Click-to-play facade — the heavy iframe loads only after a tap. */
function EmbedFacade({
  thumb,
  label,
  onPlay,
}: {
  thumb: string;
  label: string;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play video: ${label}`}
      className="group relative block h-full w-full text-left"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
      <span className="absolute inset-0 flex items-center justify-center bg-forest-950/25 transition-colors group-hover:bg-forest-950/35">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ivory-50/95 text-xl text-forest-900 shadow-lg transition-transform group-hover:scale-105" aria-hidden="true">
          ▶
        </span>
      </span>
      <span className="absolute bottom-4 left-4 max-w-[80%] truncate rounded-full bg-forest-950/80 px-3.5 py-1.5 text-xs font-medium text-ivory-50">
        {label}
      </span>
    </button>
  );
}

export default function ProductGallery({ product }: { product: Product }) {
  const { t } = useLanguage();
  /* Batch M — if this page was opened from a product card, the tapped photo
     grows into this cover (FLIP overlay); nothing happens otherwise. */
  const coverRef = useProductCoverFlight(product.slug);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  /* Batch L — fullscreen viewer. The card is 4:5 in a phone column; the
     weave is only judgeable blown up, so a tap on the photo opens one. */
  const [zoomed, setZoomed] = useState(false);
  const slides = slidesOf(product);
  // Clamp: navigating between products (or an admin removing media) could
  // leave the index pointing past the end, blanking the gallery.
  const index = Math.min(Math.max(active, 0), Math.max(slides.length - 1, 0));
  const current = slides[index];
  const stills = slides.flatMap((slide) =>
    slide.kind === "image"
      ? [{ key: slide.key, src: slide.src, alt: slide.alt }]
      : [],
  );
  const stillIndex = Math.max(
    0,
    stills.findIndex((still) => still.key === current?.key),
  );

  const pick = (i: number) => {
    setActive(i);
    setPlaying(null);
  };

  /** The viewer navigates stills; the gallery keeps its videos in the run. */
  const pickStill = (i: number) => {
    const target = stills[i];
    if (!target) return;
    const slideIndex = slides.findIndex((slide) => slide.key === target.key);
    if (slideIndex >= 0) pick(slideIndex);
  };

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden bg-ivory-100 ring-1 ring-line">
        {current?.kind === "image" && (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            aria-label={`${t("gallery.openZoom")} ${current.alt}`}
            data-testid="gallery-zoom-open"
            className="group/zoom absolute inset-0 block cursor-zoom-in"
          >
            <Image
              key={current.key}
              ref={index === 0 ? coverRef : undefined}
              src={current.src}
              alt={current.alt}
              fill
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-cover"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-forest-950/65 text-ivory-50 backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover/zoom:opacity-100"
            >
              <IconPlus className="h-4 w-4" />
            </span>
          </button>
        )}
        {current?.kind === "video" && (
          <video
            key={current.src}
            src={current.src}
            controls
            playsInline
            preload="metadata"
            aria-label={current.alt}
            className="h-full w-full bg-forest-950 object-contain"
          />
        )}
        {current?.kind === "drive" &&
          (playing === current.key ? (
            <iframe
              key={current.key}
              src={current.src}
              title={current.alt}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <EmbedFacade
              thumb={driveThumbnailUrl(current.fileId)}
              label={current.alt}
              onPlay={() => setPlaying(current.key)}
            />
          ))}
        {current?.kind === "youtube" &&
          (playing === current.key ? (
            <iframe
              key={current.key}
              src={youtubeEmbedUrl(current.videoId, true)}
              title={current.label}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <EmbedFacade
              thumb={youtubeThumbUrl(current.videoId)}
              label={current.label}
              onPlay={() => setPlaying(current.key)}
            />
          ))}
        {product.badge && (
          <span className="absolute left-4 top-4 rounded-full bg-forest-800 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ivory-50">
            {product.badge === "new"
              ? "New"
              : product.badge === "sale"
                ? "Sale"
                : "Featured"}
          </span>
        )}
      </div>

      <p
        className="mt-4 text-xs tracking-widest text-ink-soft"
        aria-live="polite"
      >
        {String(slides.length ? index + 1 : 0).padStart(2, "0")} /{" "}
        {String(slides.length).padStart(2, "0")}
      </p>
      {slides.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {slides.map((slide, i) => {
            const label =
              slide.kind === "image"
                ? `View image ${i + 1}: ${slide.alt}`
                : slide.kind === "youtube"
                  ? `Play video: ${slide.label}`
                  : `Play video ${i + 1}`;
            return (
              <button
                key={slide.key}
                type="button"
                onClick={() => pick(i)}
                aria-label={label}
                aria-pressed={index === i}
                className={`relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition-all ${
                  index === i
                    ? "ring-forest-700"
                    : "ring-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {slide.kind === "image" && (
                  <Image
                    src={slide.src}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
                {slide.kind === "video" && (
                  <video
                    src={slide.src}
                    muted
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                )}
                {slide.kind === "drive" && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={driveThumbnailUrl(slide.fileId, 200)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                {slide.kind === "youtube" && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={youtubeThumbUrl(slide.videoId)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                {slide.kind !== "image" && (
                  <span
                    className="absolute inset-0 flex items-center justify-center bg-forest-950/25 text-sm text-ivory-50"
                    aria-hidden="true"
                  >
                    ▶
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {zoomed && stills.length > 0 && (
        <GalleryLightbox
          images={stills}
          index={stillIndex}
          onIndexChange={pickStill}
          onClose={() => setZoomed(false)}
          title={product.name}
        />
      )}
    </div>
  );
}
