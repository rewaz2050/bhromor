"use client";

import { useCallback, useEffect, useState } from "react";
import { HOME_DEFAULTS, type HomeSettings } from "./home-cms";
import { sanitizeHomeSettings } from "./engagement";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiSend } from "./admin-api";

/**
 * Homepage CMS (§31) — live only. Everyone (storefront included) reads the
 * published row from GET /api/homepage; staff publish through
 * PATCH /api/admin/homepage.
 */
export function useCms() {
  const { live: staffLive } = useStaffLive();
  const [published, setPublished] = useState<HomeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/homepage", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("CMS unavailable");
        const data = (await res.json()) as {
          settings?: HomeSettings;
        };
        if (!cancelled) {
          setPublished(
            data.settings
              ? sanitizeHomeSettings(data.settings)
              : HOME_DEFAULTS,
          );
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPublished(HOME_DEFAULTS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (s: HomeSettings): Promise<boolean> => {
      if (!staffLive) return false;
      try {
        const data = await apiSend<{ settings: HomeSettings }>(
          "/api/admin/homepage",
          "PATCH",
          { settings: s },
        );
        setPublished(sanitizeHomeSettings(data.settings));
        setError(null);
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [staffLive],
  );

  return {
    settings: published ?? HOME_DEFAULTS,
    save,
    reset: () => {},
    /** True when the editor publishes to the database (staff session). */
    live: staffLive,
    loading: published === null,
    error,
    clearError: () => setError(null),
  };
}
