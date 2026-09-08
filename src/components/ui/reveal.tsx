"use client";

import { useEffect, useRef } from "react";

/** 
 * Progressive enhancement: content is never hidden while waiting for JS or an observer.
 * Polished with premium easing, will-change, and optional stagger delay.
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
      !window.IntersectionObserver ||
      !(element as HTMLElement & { animate?: unknown }).animate
    )
      return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    // Prepare initial hidden state for premium reveal — avoids flash before observer fires
    element.style.opacity = "0";
    element.style.transform = "translateY(18px) scale(0.985)";
    element.style.filter = "blur(4px)";
    element.style.willChange = "transform, opacity, filter";
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (!preference.matches) {
          // Premium editorial reveal — softer, more luxurious
          animation = element.animate(
            [
              { opacity: 0, transform: "translateY(18px) scale(0.985)", filter: "blur(4px)" },
              { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" },
            ],
            {
              duration: 640,
              delay,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "both",
            },
          );
          animation.onfinish = () => {
            element.style.opacity = "";
            element.style.transform = "";
            element.style.filter = "";
            element.style.willChange = "auto";
          };
          // Fallback for browsers where onfinish may not fire (e.g., test mocks)
          setTimeout(() => {
            if (element.style.opacity === "0") {
              element.style.opacity = "1";
              element.style.transform = "translateY(0) scale(1)";
              element.style.filter = "blur(0px)";
            }
          }, 640 + delay + 50);
        } else {
          // Reduced motion was enabled after initial hide — restore visibility
          element.style.opacity = "";
          element.style.transform = "";
          element.style.filter = "";
          element.style.willChange = "auto";
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    const reduce = () => {
      if (preference.matches) {
        observer.disconnect();
        animation?.cancel();
      }
    };
    observer.observe(element);
    // Support both modern and legacy matchMedia
    if (typeof preference.addEventListener === "function") {
      preference.addEventListener("change", reduce);
    } else if (typeof (preference as unknown as { addListener: (cb: () => void) => void }).addListener === "function") {
      (preference as unknown as { addListener: (cb: () => void) => void }).addListener(reduce);
    }
    return () => {
      observer.disconnect();
      animation?.cancel();
      if (typeof preference.removeEventListener === "function") {
        preference.removeEventListener("change", reduce);
      } else if (typeof (preference as unknown as { removeListener: (cb: () => void) => void }).removeListener === "function") {
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
