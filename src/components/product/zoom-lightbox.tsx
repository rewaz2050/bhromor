"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose, IconMinus, IconPlus } from "@/components/ui/icons";
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

  // Body scroll lock + focus + Escape.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") zoomAt(scale + 0.5, 0, 0);
      if (e.key === "-") zoomAt(scale - 0.5, 0, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, scale, zoomAt]);

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
    "flex h-11 w-11 items-center justify-center rounded-full bg-ivory-50/90 text-forest-950 shadow-md hover:bg-ivory-50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-testid="zoom-lightbox"
      data-scale={scale.toFixed(2)}
      className="fixed inset-0 z-[70] flex flex-col bg-forest-950/95 text-ivory-50"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-xs font-medium text-ivory-100/80">{alt}</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoomAt(scale - 0.5, 0, 0)} aria-label="Zoom out" className={btn}>
            <IconMinus className="h-4 w-4" />
          </button>
          <span className="min-w-[3ch] text-center text-xs tabular-nums" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={() => zoomAt(scale + 0.5, 0, 0)} aria-label="Zoom in" className={btn}>
            <IconPlus className="h-4 w-4" />
          </button>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close zoom" className={btn}>
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
        className="relative flex-1 select-none overflow-hidden"
        style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "zoom-in" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- transform-driven zoom needs the raw element */}
        <img
          src={optimizedMediaUrl(src, 1600)}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain will-change-transform"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: interacting ? "none" : "transform 120ms ease-out",
          }}
        />
      </div>
      <p className="px-4 pb-4 pt-2 text-center text-[0.68rem] text-ivory-100/70">
        Pinch or double-tap to zoom · drag to move · Esc to close
      </p>
    </div>
  );
}
