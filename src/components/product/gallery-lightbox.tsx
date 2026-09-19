"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevron, IconClose, IconMinus, IconPlus } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

/**
 * Fullscreen product viewer (Batch L).
 *
 * Shoppers judge fabric — weave, stitch, print detail — before they trust a
 * ৳1,490 panjabi, and a 4:5 card on a phone cannot show it. This is the
 * "tap the photo" layer: a dark stage, the image at full width, and the three
 * gestures people already know from every gallery app.
 *
 *   · double-tap → zoom in where you touched, double-tap again to reset
 *   · pinch (two fingers) or the +/− buttons → continuous zoom, up to 4×
 *   · drag while zoomed → pan; drag while not zoomed → swipe to the next shot
 *   · ← → keys, or the edge arrows on desktop; Esc or the ✕ closes
 *
 * Kept deliberately dependency-free (no lightbox package): it has to keep
 * working with the app's own <Image> loader and the bn/en copy, and a
 * third-party viewer brings its own styles and its own opinions along.
 */
export interface LightboxImage {
  key: string;
  src: string;
  alt: string;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const MAX_SCALE = 4;
const IDLE: View = { scale: 1, x: 0, y: 0 };
/** Pull distance (px) that commits a swipe to the next image. */
const SWIPE_COMMIT = 64;
const DOUBLE_TAP_MS = 320;

export default function GalleryLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title,
}: {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  title: string;
}) {
  const { t } = useLanguage();
  const [view, setView] = useState<View>(IDLE);
  const [swipe, setSwipe] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: "pan" | "swipe" | "pinch";
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
    startDist: number;
    startScale: number;
    at: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef<{ x: number; y: number; at: number } | null>(null);
  /* The keyboard and wheel listeners bind once, so they read the live view
     through a mirror ref instead of a stale closure. */
  const viewRef = useRef<View>(IDLE);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const count = images.length;
  const current = images[index];

  const go = useCallback(
    (step: -1 | 1) => {
      if (count === 0) return;
      onIndexChange((index + step + count) % count);
    },
    [count, index, onIndexChange],
  );

  const clampView = useCallback((next: View): View => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || next.scale <= 1) return { ...next, x: 0, y: 0 };
    const maxX = ((next.scale - 1) * rect.width) / 2;
    const maxY = ((next.scale - 1) * rect.height) / 2;
    return {
      scale: next.scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, []);

  /** Zoom around a screen point, keeping whatever is under it in place. */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const from = viewRef.current;
      const scale = Math.max(1, Math.min(MAX_SCALE, from.scale * factor));
      if (scale === from.scale) return;
      const qx = clientX - (rect.left + rect.width / 2);
      const qy = clientY - (rect.top + rect.height / 2);
      const ratio = scale / from.scale;
      setView(
        clampView({
          scale,
          x: qx - ratio * (qx - from.x),
          y: qy - ratio * (qy - from.y),
        }),
      );
    },
    [clampView],
  );

  const toggleZoomAt = useCallback(
    (clientX: number, clientY: number) => {
      if (viewRef.current.scale > 1.05) {
        setView(IDLE);
        return;
      }
      zoomAt(clientX, clientY, 2.4);
    },
    [zoomAt],
  );

  /* A new photo always opens un-zoomed — carrying 3× zoom across images
     leaves the shopper staring at a random corner of the next shirt. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per image
    setView(IDLE);
    setSwipe(0);
  }, [index]);

  /* Lock the page behind the stage, and put the shopper on the close button
     (the dialog is the only thing that should take keystrokes). */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* Keyboard: the desktop equivalent of the phone gestures. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }
      if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        const rect = stageRef.current?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
        const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        zoomAt(cx, cy, event.key === "-" ? 1 / 1.4 : 1.4);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        setView(IDLE);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, zoomAt]);

  /* Warm the neighbours so a swipe is never a loading spinner. */
  useEffect(() => {
    for (const step of [-1, 1] as const) {
      const neighbour = images[(index + step + count) % count];
      if (!neighbour) continue;
      const preload = new window.Image();
      preload.src = neighbour.src;
    }
  }, [images, index, count]);

  /** Desktop trackpad / mouse wheel zoom, anchored under the cursor. React
   *  attaches wheel passively, so this is a native listener. */
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    setDragging(true);

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: "pinch",
        startX: 0,
        startY: 0,
        viewX: 0,
        viewY: 0,
        startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startScale: viewRef.current.scale,
        at: performance.now(),
        moved: true,
      };
      setSwipe(0);
      return;
    }

    const from = viewRef.current;
    gesture.current = {
      mode: from.scale > 1 ? "pan" : "swipe",
      startX: event.clientX,
      startY: event.clientY,
      viewX: from.x,
      viewY: from.y,
      startDist: 0,
      startScale: from.scale,
      at: performance.now(),
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (active.mode === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const scale = Math.max(
          1,
          Math.min(MAX_SCALE, active.startScale * (distance / active.startDist)),
        );
        const from = viewRef.current;
        setView(clampView({ scale, x: from.x, y: from.y }));
      }
      return;
    }

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) active.moved = true;

    if (active.mode === "pan") {
      setView(
        clampView({
          scale: viewRef.current.scale,
          x: active.viewX + dx,
          y: active.viewY + dy,
        }),
      );
      return;
    }

    /* Swiping drags the photo with the finger far enough to feel physical,
       then either commits to the next shot or springs back. */
    setSwipe(Math.max(-160, Math.min(160, dx)));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    pointers.current.delete(event.pointerId);
    if (!active) {
      if (pointers.current.size === 0) setDragging(false);
      return;
    }

    if (active.mode === "pinch") {
      if (pointers.current.size === 0) {
        const from = viewRef.current;
        setView(from.scale <= 1.02 ? IDLE : clampView(from));
        gesture.current = null;
        setDragging(false);
      }
      return;
    }

    const dx = event.clientX - active.startX;
    const duration = performance.now() - active.at;

    if (active.mode === "swipe") {
      if (Math.abs(dx) > SWIPE_COMMIT) {
        go(dx < 0 ? 1 : -1);
      } else if (!active.moved && duration < 260) {
        const previousTap = lastTap.current;
        const isDoubleTap =
          previousTap !== null &&
          performance.now() - previousTap.at < DOUBLE_TAP_MS &&
          Math.abs(previousTap.x - event.clientX) < 48 &&
          Math.abs(previousTap.y - event.clientY) < 48;
        if (isDoubleTap) {
          lastTap.current = null;
          toggleZoomAt(event.clientX, event.clientY);
        } else {
          lastTap.current = {
            x: event.clientX,
            y: event.clientY,
            at: performance.now(),
          };
        }
      }
      setSwipe(0);
    }

    if (pointers.current.size === 0) setDragging(false);
    gesture.current = null;
  };

  if (!current) return null;

  const zoomed = view.scale > 1.02;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${t("gallery.viewer")} — ${title}`}
      data-testid="gallery-lightbox"
      className="fixed inset-0 z-[90] flex flex-col bg-forest-950/97 text-ivory-50 backdrop-blur-sm"
    >
      <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-gold-200">
            {t("gallery.viewer")}
          </p>
          <p className="truncate text-sm text-ivory-100/80">{current.alt}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.4)}
            aria-label={t("gallery.zoomOut")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ivory-100/80 hover:bg-white/10 hover:text-white"
          >
            <IconMinus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.4)}
            aria-label={t("gallery.zoomIn")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ivory-100/80 hover:bg-white/10 hover:text-white"
          >
            <IconPlus className="h-4 w-4" />
          </button>
          {zoomed && (
            <button
              type="button"
              onClick={() => setView(IDLE)}
              className="hidden min-h-11 items-center rounded-full px-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ivory-100/75 hover:bg-white/10 hover:text-white sm:flex"
            >
              {t("gallery.resetZoom")}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("gallery.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-ivory-50 hover:bg-white/20"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: zoomed ? "grab" : "zoom-in" }}
        data-zoom={zoomed ? "in" : "out"}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate3d(${view.x + (zoomed ? 0 : swipe)}px, ${view.y}px, 0) scale(${view.scale})`,
            transition: dragging ? "none" : "transform 240ms var(--ease-refined)",
          }}
        >
          <Image
            key={current.key}
            src={current.src}
            alt={current.alt}
            fill
            sizes="100vw"
            className="object-contain"
            draggable={false}
          />
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t("gallery.previous")}
              className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-forest-950/60 text-ivory-50 hover:bg-forest-950/85 sm:flex"
            >
              <IconChevron className="h-5 w-5 -rotate-90" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t("gallery.next")}
              className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-forest-950/60 text-ivory-50 hover:bg-forest-950/85 sm:flex"
            >
              <IconChevron className="h-5 w-5 rotate-90" />
            </button>
          </>
        )}
      </div>

      <footer className="px-4 pb-5 pt-3 sm:px-6">
        <p className="text-center text-[0.62rem] uppercase tracking-[0.16em] text-ivory-100/60">
          {t("gallery.zoomHint")}
        </p>
        {count > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2.5 overflow-x-auto pb-1">
            {images.map((image, i) => (
              <button
                key={image.key}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`${t("gallery.openImage")} ${i + 1}`}
                aria-pressed={i === index}
                className={`relative h-14 w-12 shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${
                  i === index
                    ? "ring-gold-300"
                    : "ring-white/15 opacity-60 hover:opacity-100"
                }`}
              >
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
        <p aria-live="polite" className="mt-1 text-center text-xs text-ivory-100/70">
          {index + 1} / {count}
        </p>
      </footer>
    </div>
  );
}
