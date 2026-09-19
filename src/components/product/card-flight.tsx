"use client";

import { useEffect, useRef } from "react";
import {
  boxOf,
  clearFlight,
  flightTransform,
  isFlightFresh,
  paintedSrcOf,
  prefersReducedMotion,
  readFlight,
  rememberFlight,
} from "@/lib/card-flight";

/**
 * Wraps the product card's photo link (Batch M).
 *
 * The card's own controls stand it down (a swipe on the rails, a tap on the
 * heart or "quick add"): the flight is for "open this garment", not for every
 * touch that happens to land on the card.
 */
export function useCardFlight({
  slug,
  imageSelector,
}: {
  slug: string;
  imageSelector: string;
}) {
  const armed = useRef(true);

  const markGesture = () => {
    armed.current = false;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      armed.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return {
    /** Pointer/scroll gesture started on the card — do not hijack it. */
    onPointerDownCapture: () => {
      armed.current = false;
    },
    onPointerUpCapture: () => {
      // A tap that ends on the card is ambiguous with a swipe: the browser
      // cancels the click for a swipe, so let the click decide.
      armed.current = true;
    },
    markGesture,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      const override =
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (override || !armed.current) return;
      const link = event.currentTarget;
      const container = link.closest("[data-card-flight]");
      const image =
        container?.querySelector(imageSelector) ??
        link.querySelector(imageSelector) ??
        link;
      const box = boxOf(image);
      const src = paintedSrcOf(image);
      if (!box || !src || prefersReducedMotion()) return;
      rememberFlight({ src, box, slug, at: Date.now() });
      /* No preventDefault: the browser's own navigation stays in charge, so a
         slow RSC response, a middle-click or a stop button all still behave. */
    },
  };
}

/**
 * On the product page: if this page was opened from a card, grow a clone of
 * the card's photo into the gallery's cover photo. Returns the ref to attach
 * to that cover image.
 */
export function useProductCoverFlight(slug: string) {
  const targetRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const flight = readFlight();
    if (!flight) return;
    // Whether or not it belongs to this page, the record is spent: keeping it
    // would replay the animation on the next navigation too.
    clearFlight();
    if (flight.slug !== slug || !isFlightFresh(flight)) return;
    if (prefersReducedMotion()) return;
    if (typeof Element === "undefined" || !Element.prototype.animate) return;

    const target = targetRef.current;
    if (!target) return;

    let overlay: HTMLDivElement | null = null;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      const to = boxOf(target);
      if (!to) return;
      const { dx, dy, scale } = flightTransform(flight.box, to);

      overlay = document.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("data-card-flight-overlay", "");
      Object.assign(overlay.style, {
        position: "fixed",
        left: `${flight.box.left}px`,
        top: `${flight.box.top}px`,
        width: `${flight.box.width}px`,
        height: `${flight.box.height}px`,
        margin: "0",
        zIndex: "60",
        pointerEvents: "none",
        overflow: "hidden",
        backgroundColor: "#f6f1e6", // ivory-100 — the card's own backdrop
        willChange: "transform",
      });
      const clone = document.createElement("img");
      clone.src = flight.src;
      clone.alt = "";
      Object.assign(clone.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      });
      overlay.appendChild(clone);
      document.body.appendChild(overlay);

      // The clone covers the page until it has grown: no flash of the final
      // photo underneath, no double image while it travels.
      const animation = overlay.animate(
        [
          { transform: "translate3d(0,0,0) scale(1)" },
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` },
        ],
        {
          duration: 460,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards",
        },
      );
      const finish = () => {
        overlay?.remove();
        overlay = null;
      };
      animation.addEventListener("finish", finish);
      animation.addEventListener("cancel", finish);
      /* Safety net: a tab hidden mid-flight may never fire `finish`. */
      window.setTimeout(finish, 900);
    };

    /* The cover is a next/image with a fixed aspect box, so it is laid out on
       the first frame; wait for the pixels so the clone hands over cleanly. */
    if (target.complete && target.naturalWidth > 0) {
      run();
    } else {
      target.addEventListener("load", run, { once: true });
      const bail = window.setTimeout(run, 400);
      return () => {
        cancelled = true;
        window.clearTimeout(bail);
        overlay?.remove();
      };
    }
    return () => {
      cancelled = true;
      overlay?.remove();
    };
  }, [slug]);

  return targetRef;
}
