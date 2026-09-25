"use client";

import { useLayoutEffect } from "react";
import type { HomeSettings } from "@/lib/home-cms";
import { publishHomeSettings } from "@/lib/use-home-settings";

/**
 * Seeds the homepage-settings store from rows the server page already
 * rendered — the same pre-paint trick as CatalogHydrator (speed pass,
 * 2026-09-25). The hydration render still sees the defaults the server
 * saw (no mismatch); the layout effect swaps the published row in before
 * paint, so the hero/CMS sections never flash defaults and no second
 * /api/homepage fetch fires.
 */
export default function HomeSettingsHydrator({ settings }: { settings: HomeSettings }) {
  useLayoutEffect(() => {
    publishHomeSettings(settings);
  }, [settings]);
  return null;
}
