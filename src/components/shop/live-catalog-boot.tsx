"use client";

import { useEffect } from "react";
import { ensureLiveCatalog, ensureLiveZones } from "@/lib/live-catalog";

/**
 * Mounted once in the site layout. Warms the live registry for guests —
 * cart, search and checkout resolve through it before any signed-in
 * provider exists. Renders nothing; fetch-once, silent on failure.
 */
export default function LiveCatalogBoot() {
  useEffect(() => {
    void ensureLiveCatalog();
    void ensureLiveZones();
  }, []);
  return null;
}
