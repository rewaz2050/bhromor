"use client";

/**
 * Hands the store the promo state the server already read.
 *
 * The seed happens IN THE RENDER BODY, before the strips and the product
 * grid below it render, so there is no frame in which the shopper sees the
 * "nothing is running" answer: the server paints the flash bar and the flash
 * prices, and hydration agrees with it instead of undoing it.
 *
 * It runs on both sides on purpose — during SSR it seeds the server's copy of
 * the store (the one the strips read while rendering), and on the client it
 * seeds the browser's copy before the same strips hydrate.
 *
 * Renders nothing.
 */

import { useEffect } from "react";
import { notifyPromos, seedPromos, type PromoSeed } from "@/lib/promo-store";

export default function PromoBoot({ seed }: { seed: PromoSeed }) {
  seedPromos(seed);
  // A later server render (RSC refresh) can hand us a new seed while the
  // strips are already mounted; wake them after the commit, never during it.
  useEffect(() => {
    notifyPromos();
  }, [seed]);
  return null;
}
