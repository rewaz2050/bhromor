"use client";

/**
 * Admin → Access requests: password-reset requests from vendor / rider
 * logins (2026-09-26; no SMS, no e-mail). Live only. Polled every 15 s
 * while the tab is visible, like the other staff queues.
 */

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import { usePoll } from "./use-poll";
import { useStaffLive } from "./use-staff-live";

export type AccessRequestStatus = "pending" | "approved" | "rejected" | "used" | "expired";

export interface AccessRequest {
  id: string;
  kind: "vendor" | "rider";
  subjectId: string;
  subjectName: string;
  email: string;
  phone: string;
  status: AccessRequestStatus;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
}

interface Payload {
  pending: AccessRequest[];
  recent: AccessRequest[];
  /** False when the migration has not been applied yet. */
  ready?: boolean;
}

export const ACCESS_REQUESTS_POLL_MS = 15_000;

export function useAccessRequests() {
  const { live, checked } = useStaffLive();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await apiGet<Payload>("/api/admin/access-requests");
      setData({ pending: next.pending ?? [], recent: next.recent ?? [], ready: next.ready !== false });
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setData(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  usePoll(refresh, ACCESS_REQUESTS_POLL_MS, live);

  /** Approve (opens the 24 h window) or reject with a note. */
  const decide = useCallback(
    async (id: string, action: "approve" | "reject", note?: string): Promise<AccessRequest | null> => {
      if (!live) return null;
      try {
        const res = await apiSend<{ request: AccessRequest }>(
          `/api/admin/access-requests/${encodeURIComponent(id)}`,
          "POST",
          { action, note: note ?? null },
        );
        setError(null);
        await refresh();
        return res.request;
      } catch (err) {
        setError(apiErrorMessage(err));
        return null;
      }
    },
    [live, refresh],
  );

  return {
    pending: data?.pending ?? [],
    recent: data?.recent ?? [],
    ready: data?.ready !== false,
    live,
    loading: live && (!checked || data === null),
    error,
    clearError: () => setError(null),
    decide,
    reset: refresh,
  };
}
