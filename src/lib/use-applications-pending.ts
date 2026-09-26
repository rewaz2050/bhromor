"use client";

/**
 * Pending shop + rider applications and password-reset requests (apply =
 * sign up, 2026-09-26; no SMS / e-mail).
 *
 * Polled while the admin tab is visible so a new application or reset
 * request shows up as a badge on Shops / Riders / Access requests and a
 * banner on the dashboard without anyone opening the queues. Live only;
 * zero everywhere else. `total` is everything waiting for a human.
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./admin-api";
import { usePoll } from "./use-poll";
import { useStaffLive } from "./use-staff-live";

export const APPLICATIONS_POLL_MS = 30_000;

export interface ApplicationsPending {
  shops: number;
  riders: number;
  /** Password-reset requests waiting for a staff decision (no e-mail reset exists). */
  resets: number;
}

const NONE: ApplicationsPending = { shops: 0, riders: 0, resets: 0 };

export function useApplicationsPending(): ApplicationsPending & { total: number } {
  const { live } = useStaffLive();
  const [counts, setCounts] = useState<ApplicationsPending>(NONE);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<ApplicationsPending>("/api/admin/applications");
      setCounts({
        shops: Number.isFinite(data.shops) ? data.shops : 0,
        riders: Number.isFinite(data.riders) ? data.riders : 0,
        resets: Number.isFinite(data.resets) ? data.resets : 0,
      });
    } catch {
      // A failed count only hides the badge; the queues still work.
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setCounts(NONE);
      return;
    }
    void refresh();
  }, [live, refresh]);

  usePoll(refresh, APPLICATIONS_POLL_MS, live);

  return { ...counts, total: counts.shops + counts.riders + counts.resets };
}
