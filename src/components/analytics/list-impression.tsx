"use client";

/**
 * UX plan §0 — `view_item_list`: fires once when a rail / grid actually
 * scrolls into view (≥ 25% visible), so "which section gets looked at" is a
 * real number, not "which section was rendered". Also stamps `data-list` on
 * nothing itself — the parent section carries it, and product cards read it
 * on tap for `select_item`.
 */

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

export default function ListImpression({ list, count }: { list: string; count: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fired = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (fired.current === list) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (fired.current !== list) {
          fired.current = list;
          track({ type: "view_item_list", list, count });
        }
        io.disconnect();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [list, count]);
  return <span ref={ref} aria-hidden="true" className="block h-px w-px" data-list-impression={list} />;
}

/** The list a tapped card belongs to — nearest `data-list` ancestor, else the path. */
export const listNameFor = (el: Element | null, fallback: string): string =>
  el?.closest<HTMLElement>("[data-list]")?.dataset.list ?? fallback;
