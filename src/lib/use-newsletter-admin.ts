"use client";

/**
 * Staff newsletter list — live only (see use-staff.ts).
 * Subscriber emails are real customer data: without a staff session the
 * page says so instead of inventing a list.
 */

import { useCallback, useEffect, useState } from "react";
import type { Subscriber } from "./engagement";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useNewsletterAdmin() {
  const { live, checked } = useStaffLive();
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ subscribers: Subscriber[] }>(
        "/api/admin/newsletter",
      );
      setSubscribers(data.subscribers);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setSubscribers(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/newsletter?id=${encodeURIComponent(id)}`,
          "DELETE",
        );
        setError(null);
        setSubscribers((prev) =>
          prev ? prev.filter((s) => s.id !== id) : prev,
        );
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live],
  );

  return {
    subscribers: subscribers ?? [],
    remove,
    refresh,
    live,
    loading: live && (!checked || subscribers === null),
    error,
    clearError: () => setError(null),
  };
}
