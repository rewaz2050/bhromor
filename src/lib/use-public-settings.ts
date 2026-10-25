"use client";

/**
 * Customer surfaces' read-only ops settings (see /api/settings). Deliberately
 * a SEPARATE module from ./use-settings — that one drags the staff auth
 * client (admin emails, the ops gate path) into whatever imports it, and
 * this one must never ship that to a shopper's browser.
 */

import { useEffect, useState } from "react";
import { fetchJsonWithDeadline } from "./fetch-with-deadline";
import {
  sanitizeSettings,
  SETTINGS_DEFAULTS,
  type AdminSettings,
} from "./settings-store";

/* Customer surfaces — the same settings, read-only, once per session   */
/* ------------------------------------------------------------------ */

let publicCache: AdminSettings | null = null;
let publicInflight: Promise<AdminSettings> | null = null;

const fetchPublicSettings = (): Promise<AdminSettings> => {
  if (publicCache) return Promise.resolve(publicCache);
  if (!publicInflight) {
    publicInflight = fetchJsonWithDeadline<{ settings: AdminSettings }>("/api/settings", { cache: "no-store" })
      .then((data) => {
        publicCache = sanitizeSettings(data.settings);
        return publicCache;
      })
      .catch(() => SETTINGS_DEFAULTS)
      .finally(() => {
        publicInflight = null;
      });
  }
  return publicInflight;
};

/**
 * Public ops settings for shopper surfaces (checkout quote, the bag's
 * cash-at-the-door card, the arrival cue). Fetches once per page session,
 * serves launch defaults while in flight or when the read fails — the
 * storefront never blocks on it and never invents numbers.
 */
export function usePublicSettings() {
  const [settings, setSettings] = useState<AdminSettings>(
    publicCache ?? SETTINGS_DEFAULTS,
  );
  const [loading, setLoading] = useState(!publicCache);
  useEffect(() => {
    if (publicCache) return;
    let alive = true;
    void fetchPublicSettings().then((next) => {
      if (!alive) return;
      setSettings(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { settings, loading };
}

/** Test-only reset; failed reads never populate the successful-response cache. */
export const __resetPublicSettingsForTests = () => { publicCache = null; publicInflight = null; };
