"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Navigation progress bar (Batch N).
 *
 * On a 3G phone in Sunamganj, a tap on a card is followed by a second of
 * nothing: the RSC request goes out, the server renders, the segment swaps.
 * That second is where shops lose people — the site looks unresponsive and
 * they tap again (or leave).
 *
 * This is the lightest honest answer: a 2px bar at the top of the window that
 * starts on the tap, creeps to 90% while the request is in flight, and lands
 * when the new page commits. No spinner, no overlay, no dependency.
 *
 * Deliberately quiet: internal links only, not for hash jumps, downloads, new
 * tabs, modified clicks or external hosts — and nothing at all when the user
 * prefers reduced motion.
 */
export default function PageProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);
  const settling = useRef<number | null>(null);
  const active = useRef(false);
  const shownPath = useRef(pathname);

  const clearCreep = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  const finish = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    clearCreep();
    if (settling.current !== null) window.clearTimeout(settling.current);
    setProgress(100);
    settling.current = window.setTimeout(() => {
      setVisible(false);
      settling.current = window.setTimeout(() => setProgress(0), 240);
    }, 180);
  }, []);

  const start = useCallback(() => {
    if (active.current) return;
    if (
      typeof window === "undefined" ||
      !window.matchMedia ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (settling.current !== null) {
      window.clearTimeout(settling.current);
      settling.current = null;
    }
    active.current = true;
    setVisible(true);
    setProgress(12);
    /* Creep, never arrive: 90% is the promise that something is still coming.
       The last 10% belong to the page that actually commits. */
    clearCreep();
    timer.current = window.setInterval(() => {
      setProgress((value) => (value >= 90 ? 90 : value + (90 - value) * 0.18));
    }, 220);
  }, []);

  /* The route committed — the pathname this layout renders changed. */
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    finish();
  }, [pathname, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return; // external / mailto / tel
      start();
    };
    const onPop = () => finish();
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
      clearCreep();
      if (settling.current !== null) window.clearTimeout(settling.current);
    };
  }, [start, finish]);

  if (!visible) return null;

  return (
    <div
      data-testid="page-progress"
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5"
    >
      <div
        className="h-full bg-gold-400 shadow-[0_0_8px_rgba(194,160,101,0.6)]"
        style={{
          width: `${Math.round(progress)}%`,
          transition: "width 220ms ease-out, opacity 240ms ease-out",
          opacity: progress >= 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
