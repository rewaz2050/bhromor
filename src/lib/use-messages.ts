"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContactMessage, ContactStatus } from "./engagement";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Staff contact inbox — live only. Reads/marks the contact_messages table.
 */
export function useMessages() {
  const { live, checked } = useStaffLive();
  const [liveMessages, setLiveMessages] = useState<ContactMessage[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ messages: ContactMessage[] }>(
        "/api/admin/messages",
      );
      setLiveMessages(data.messages);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setLiveMessages(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const setStatus = useCallback(
    async (id: string, status: ContactStatus): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend("/api/admin/messages", "PATCH", { id, status });
        setError(null);
        setLiveMessages((prev) =>
          prev ? prev.map((m) => (m.id === id ? { ...m, status } : m)) : prev,
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
    messages: liveMessages ?? [],
    setStatus,
    reset: refresh,
    refresh,
    live,
    loading: live && (!checked || liveMessages === null),
    error,
    clearError: () => setError(null),
  };
}
