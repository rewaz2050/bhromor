"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import ZoomLightbox from "./zoom-lightbox";
import { IconSearch } from "@/components/ui/icons";
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
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  /* Desktop hover magnifier: the image scales around the cursor while the
     pointer is over it (mouse only — touch goes straight to the lightbox). */
  const [magnify, setMagnify] = useState<{ x: number; y: number } | null>(null);
  const slides = slidesOf(product);
  // Clamp: navigating between products (or an admin removing media) could
  // leave the index pointing past the end, blanking the gallery.
  const index = Math.min(Math.max(active, 0), Math.max(slides.length - 1, 0));
  const current = slides[index];

  const pick = (i: number) => {
    setActive(i);
    setPlaying(null);
  };

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden bg-ivory-100 ring-1 ring-line">
        {current?.kind === "image" && (
          <button
            type="button"
            data-testid="gallery-zoom-trigger"
            aria-label={`Zoom image: ${current.alt}`}
            onClick={() => setZoomOpen(true)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMagnify({
                x: ((e.clientX - r.left) / r.width) * 100,
                y: ((e.clientY - r.top) / r.height) * 100,
              });
            }}
            onMouseLeave={() => setMagnify(null)}
            className="group absolute inset-0 block h-full w-full cursor-zoom-in overflow-hidden"
          >
            <Image
              src={current.src}
              alt={current.alt}
              fill
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-cover transition-transform duration-150 ease-out motion-reduce:transition-none"
              style={
                magnify
                  ? { transform: "scale(1.9)", transformOrigin: `${magnify.x}% ${magnify.y}%` }
                  : undefined
              }
            />
            <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-forest-950/75 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ivory-50 backdrop-blur-[2px] transition-opacity group-hover:opacity-0">
              <IconSearch className="h-3 w-3" /> Zoom
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

      {zoomOpen && current?.kind === "image" ? (
        <ZoomLightbox src={current.src} alt={current.alt} onClose={() => setZoomOpen(false)} />
      ) : null}

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
    </div>
  );
}
