"use client";

import { useEffect } from "react";
import type Lenis from "lenis";

/**
 * Inertial wheel scrolling for pointer devices.
 *
 * Perf (audit 2026-09-17 P2.3): lenis used to be a static import in the root
 * layout — 33 KB of JS parsed on every page for every visitor, plus a
 * permanent requestAnimationFrame loop. Phones scroll natively (touch
 * scrolling is already smooth and lenis' touch mode fights the browser), so
 * the library is now loaded ONLY on devices with a fine pointer + hover
 * (desktop/laptop), only when motion is allowed, and only after the page is
 * idle — never on the critical path.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (reduce.matches || !pointer.matches) return;

    let cancelled = false;
    let lenis: Lenis | null = null;
    let rafId = 0;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleAnchorClick = (e: MouseEvent) => {
      if (!lenis) return;
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const id = href.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -96, duration: 1.1 });
      history.pushState(null, "", href);
    };

    const teardown = () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("click", handleAnchorClick);
      if (lenis) {
        lenis.destroy();
        if ((window as unknown as { lenis?: Lenis }).lenis === lenis) {
          delete (window as unknown as { lenis?: Lenis }).lenis;
        }
        lenis = null;
      }
    };

    const start = async () => {
      const mod = await import("lenis").catch(() => null);
      if (!mod || cancelled) return;
      const instance = new mod.default({
        duration: 1.1,
        easing: (t) => Math.min(1, 1 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.8,
        infinite: false,
        autoResize: true,
      });
      lenis = instance;
      (window as unknown as { lenis?: Lenis }).lenis = instance;
      const raf = (time: number) => {
        instance.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
      document.addEventListener("click", handleAnchorClick);
    };

    // After first paint + idle: the hero and product grid come first.
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => void start(), { timeout: 2500 });
    } else {
      timeoutId = setTimeout(() => void start(), 1200);
    }

    const onReduce = (e: MediaQueryListEvent) => {
      if (e.matches) teardown();
    };
    reduce.addEventListener("change", onReduce);

    return () => {
      cancelled = true;
      if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      reduce.removeEventListener("change", onReduce);
      teardown();
    };
  }, []);

  return null;
}
