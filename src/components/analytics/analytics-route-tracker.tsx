"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track, wireEvent } from "@/lib/analytics";
import { currentLang, record } from "@/lib/events-sink";
import { currentPageShop } from "@/lib/page-shop";

/**
 * App Router navigations do not reload the page, so neither tag sees them
 * by itself. This fires one page_view per pathname change — skipping the
 * first render for the VENDORS, which their loader scripts already counted,
 * while the shop's own sink (UX plan §0) gets every page view including the
 * first: that is what "sessions", "bounce" and "pages per session" count.
 */
export default function AnalyticsRouteTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === pathname) return;
    const first = last.current === null;
    last.current = pathname;
    if (first) {
      // B4 — a shop's storefront registers itself (ShopAttribute) before this
      // runs, so the page_view is attributed to that shop on both ends.
      const wire = wireEvent({ type: "page_view", path: pathname, shop: currentPageShop() ?? undefined });
      const lang = currentLang();
      record(lang ? { ...wire, lang } : wire);
      return;
    }
    track({ type: "page_view", path: pathname });
  }, [pathname]);
  return null;
}
