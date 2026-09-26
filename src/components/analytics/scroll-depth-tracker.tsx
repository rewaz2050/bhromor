"use client";

/**
 * UX plan §0 — `scroll_depth` 25 / 50 / 75 / 100 % of the page, each once
 * per page view. Passive listener, rAF-throttled; nothing is sent until the
 * shopper actually scrolls.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

const MARKS = [25, 50, 75, 100] as const;

export default function ScrollDepthTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const seen = new Set<number>();
    let ticking = false;
    const measure = () => {
      ticking = false;
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = Math.min(100, Math.round(((window.scrollY + 0.5) / total) * 100));
      for (const mark of MARKS) {
        if (pct >= mark && !seen.has(mark)) {
          seen.add(mark);
          track({ type: "scroll_depth", path: pathname ?? "/", depth: mark });
        }
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);
  return null;
}
