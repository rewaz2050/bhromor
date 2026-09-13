"use client";

/**
 * `?ref=PS-XXXXXX` capture (P0 #7) — mounted once in the storefront chrome, so
 * a shared link works whether it lands on /shop, a product, or the home page.
 *
 * The code lives in localStorage (not a cookie, not the URL): it is this
 * device's "who sent me here", it is offered once at checkout, and it can be
 * removed there. Nothing is credited from here — the server decides money.
 */

import { useEffect } from "react";
import { captureRefFromUrl } from "@/lib/referral";

export default function RefCapture() {
  useEffect(() => {
    captureRefFromUrl();
  }, []);
  return null;
}
