"use client";

import { useEffect, useRef } from "react";

/**
 * Progressive editorial reveal.
 *
 * Content is NEVER hidden while waiting for JS: the element renders visible,
 * and only when the browser supports the observer and motion is allowed do
 * we hide it — and only if it is still below the fold. Anything already on
 * screen at mount (the section header, the first product row) stays put, so
 * the first paint is the final paint (audit 2026-09-17 P2.4: the previous
 * version hid every block with opacity 0 + blur(4px) on mount, then ran a
 * 640 ms Web Animation per card — the hero-to-grid handoff flashed blank and
 * the blur filter forced a compositor layer per element on phones).
 *
 * The animation itself is a CSS transition (`.reveal-pending` →
 * `.reveal-shown`, see globals.css), which the compositor runs off the main
 * thread and which reduced-motion turns off wholesale.
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  threshold = 0.15,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      typeof window === "undefined" ||
      !window.matchMedia ||
      !window.IntersectionObserver
    )
      return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    // Already on screen (or above it)? Leave it exactly as painted.
    const rect = element.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < viewportH * 0.92) return;

    element.style.transitionDelay = delay > 0 ? `${delay}ms` : "";
    element.classList.add("reveal-pending");

    const show = () => {
      element.classList.add("reveal-shown");
      // Drop the transition hooks once done so later layout/opacity changes
      // (hover, drawers) are not slowed by the reveal transition.
      const done = () => {
        element.classList.remove("reveal-pending", "reveal-shown");
        element.style.transitionDelay = "";
        element.removeEventListener("transitionend", done);
      };
      element.addEventListener("transitionend", done);
      setTimeout(done, 900 + delay);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        show();
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    const reduce = () => {
      if (preference.matches) {
        observer.disconnect();
        element.classList.remove("reveal-pending", "reveal-shown");
        element.style.transitionDelay = "";
      }
    };
    observer.observe(element);
    if (typeof preference.addEventListener === "function") {
      preference.addEventListener("change", reduce);
    } else if (typeof (preference as unknown as { addListener?: (cb: () => void) => void }).addListener === "function") {
      (preference as unknown as { addListener: (cb: () => void) => void }).addListener(reduce);
    }
    return () => {
      observer.disconnect();
      element.classList.remove("reveal-pending", "reveal-shown");
      element.style.transitionDelay = "";
      if (typeof preference.removeEventListener === "function") {
        preference.removeEventListener("change", reduce);
      } else if (typeof (preference as unknown as { removeListener?: (cb: () => void) => void }).removeListener === "function") {
        (preference as unknown as { removeListener: (cb: () => void) => void }).removeListener(reduce);
      }
    };
  }, [delay, threshold]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
