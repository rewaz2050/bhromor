"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getDemoMessages,
  resetDemoMessages,
  setDemoMessageStatus,
  subscribeDemoMessages,
  type ContactMessage,
  type ContactStatus,
} from "./engagement";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Staff contact inbox with live cutover (see use-coupons.ts).
 * Staff sessions read/mark the contact_messages table; demo keeps the
 * browser-local inbox the demo contact form writes to.
 */
export function useMessages() {
  const demo = useSyncExternalStore(
    subscribeDemoMessages,
    getDemoMessages,
    getDemoMessages,
  );
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveMessages(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const setStatus = useCallback(
    async (id: string, status: ContactStatus): Promise<boolean> => {
      if (!live) {
        setDemoMessageStatus(id, status);
        return true;
      }
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

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetDemoMessages();
  }, [live, refresh]);

  return {
    messages: live ? (liveMessages ?? []) : demo,
    setStatus,
    reset,
    refresh,
    live,
    loading: live && (!checked || liveMessages === null),
    error,
    clearError: () => setError(null),
  };
}
