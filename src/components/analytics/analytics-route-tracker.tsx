"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { analyticsEnabled, track } from "@/lib/analytics";

/**
 * App Router navigations do not reload the page, so neither tag sees them
 * by itself. This fires one page_view per pathname change — skipping the
 * first render, which the loader scripts already counted.
 */
export default function AnalyticsRouteTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!analyticsEnabled()) return;
    if (last.current === null) {
      last.current = pathname;
      return;
    }
    if (last.current === pathname) return;
    last.current = pathname;
    track({ type: "page_view", path: pathname });
  }, [pathname]);
  return null;
}
