"use client";

import { useEffect, useRef } from "react";

/** Progressive enhancement: content is never hidden while waiting for JS or an observer. */
export default function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      !window.matchMedia ||
      !window.IntersectionObserver ||
      !element.animate
    )
      return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (!preference.matches)
          animation = element.animate(
            [
              { opacity: 0, transform: "translateY(12px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );
      },
      { threshold: 0.15 },
    );
    const reduce = () => {
      if (preference.matches) {
        observer.disconnect();
        animation?.cancel();
      }
    };
    observer.observe(element);
    preference.addEventListener("change", reduce);
    return () => {
      observer.disconnect();
      animation?.cancel();
      preference.removeEventListener("change", reduce);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
