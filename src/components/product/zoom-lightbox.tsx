"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose, IconMinus, IconPlus, IconRefresh } from "@/components/ui/icons";
import Drawer from "@/components/ui/drawer";
import { useLanguage } from "@/components/i18n/language-provider";
import { bnDigits } from "@/lib/arrival";
import { optimizedMediaUrl } from "@/lib/media-url";

const MIN = 1;
const MAX = 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Full-screen zoom for one product photo — pinch on phones, wheel / double
 * click on desktop, drag to pan. Plain pointer maths, no library: the
 * whole point is that a shopper can see the weave and the stitching of a
 * ৳1,890 panjabi before paying cash at the door.
 */
export default function ZoomLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const [view, setViewState] = useState({ scale: 1, tx: 0, ty: 0 });
  /** True while a finger/mouse is on the stage — transforms then follow
   *  the pointer instantly instead of easing. */
  const [interacting, setInteracting] = useState(false);
  const viewRef = useRef(view);
  const setView = useCallback((next: { scale: number; tx: number; ty: number }) => {
    viewRef.current = next;
    setViewState(next);
  }, []);
  const { scale, tx, ty } = view;
  const stage = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; scale: number; tx: number; ty: number; cx: number; cy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef(0);

  /** Zoom to `next` keeping the stage point (px,py — relative to centre) fixed. */
  const zoomAt = useCallback(
    (next: number, px: number, py: number) => {
      const cur = viewRef.current;
      const s = clamp(next, MIN, MAX);
      if (s === MIN) {
        setView({ scale: 1, tx: 0, ty: 0 });
        return;
      }
      const ratio = s / cur.scale;
      setView({ scale: s, tx: px - (px - cur.tx) * ratio, ty: py - (py - cur.ty) * ratio });
    },
    [setView],
  );

  const relative = (e: { clientX: number; clientY: number }) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  // Modal isolation, focus trapping/restoration and Escape belong to Drawer.
  // Use the current view ref so zooming never reinstalls listeners or steals
  // focus from the control the shopper is using.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomAt(viewRef.current.scale + 0.5, 0, 0);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomAt(viewRef.current.scale - 0.5, 0, 0);
      } else if (event.key === "Home") {
        event.preventDefault();
        zoomAt(1, 0, 0);
      } else if (viewRef.current.scale > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const current = viewRef.current;
        setView({ ...current,
          tx: current.tx + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0),
          ty: current.ty + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, setView]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setInteracting(true);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const mid = relative({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, tx, ty, cx: mid.x, cy: mid.y };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, tx, ty };
      // double-tap toggles 1 ↔ 2.5 at the tap point (touch has no dblclick)
      const now = Date.now();
      if (e.pointerType === "touch" && now - lastTap.current < 300) {
        const p = relative(e);
        zoomAt(scale > 1 ? 1 : 2.5, p.x, p.y);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      const s = clamp(g.scale * (dist / Math.max(g.dist, 1)), MIN, MAX);
      const ratio = s / g.scale;
      setView({ scale: s, tx: g.cx - (g.cx - g.tx) * ratio, ty: g.cy - (g.cy - g.ty) * ratio });
    } else if (pointers.current.size === 1 && drag.current && viewRef.current.scale > 1) {
      setView({
        scale: viewRef.current.scale,
        tx: drag.current.tx + (e.clientX - drag.current.x),
        ty: drag.current.ty + (e.clientY - drag.current.y),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setInteracting(false);
    }
    if (viewRef.current.scale <= MIN + 0.01) setView({ scale: 1, tx: 0, ty: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = relative(e);
    zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = relative(e);
    zoomAt(scale > 1 ? 1 : 2.5, p.x, p.y);
  };

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full bg-ivory-50/90 text-forest-950 hover:bg-ivory-50 disabled:opacity-50";

  return (
    <Drawer open onClose={onClose} initialFocusRef={closeBtn} label={alt} side="center"
      panelBg="bg-forest-950" panelClassName="!inset-0 !h-full !max-h-none !w-full !translate-x-0 !rounded-none">
    <div
      data-testid="zoom-lightbox"
      data-scale={scale.toFixed(2)}
      className="flex h-full min-h-0 flex-col text-ivory-50"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-xs font-medium text-ivory-100/80">{alt}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoomAt(scale - 0.5, 0, 0)} disabled={scale <= MIN} aria-label={t("gallery.zoomOut")} className={btn}>
            <IconMinus className="h-4 w-4" />
          </button>
          <span className="min-w-[3ch] text-center text-xs tabular-nums" aria-live="polite">
            {lang === "bn" ? bnDigits(String(Math.round(scale * 100))) : Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={() => zoomAt(scale + 0.5, 0, 0)} disabled={scale >= MAX} aria-label={t("gallery.zoomIn")} className={btn}>
            <IconPlus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoomAt(1, 0, 0)} aria-label={t("gallery.resetZoom")} className={btn}>
            <IconRefresh className="h-4 w-4" />
          </button>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label={t("gallery.closeZoom")} className={btn}>
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={stage}
        data-testid="zoom-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        className="relative min-h-0 flex-1 select-none overflow-hidden"
        style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "zoom-in" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- transform-driven zoom needs the raw element */}
        <img
          src={optimizedMediaUrl(src, 1600)}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain will-change-transform motion-reduce:!transition-none"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: interacting ? "none" : "transform 120ms ease-out",
          }}
        />
      </div>
      <p className="px-4 pb-4 pt-2 text-center text-[0.68rem] text-ivory-100/70">
        {t("gallery.zoomHelp")}
      </p>
    </div>
    </Drawer>
  );
}
