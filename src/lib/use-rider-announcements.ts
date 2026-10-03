"use client";

/** Admin → Riders → Announcements (202610020001). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { AdminAnnouncement } from "./db/rider-inbox";
import type { AnnouncementSeverity } from "./rider-inbox";

export type { AdminAnnouncement };

export interface AnnouncementDraft {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  riderId: string | null;
  expiresHours: number | null;
}

export const useRiderAnnouncements = () => {
  const { live, checked } = useStaffLive();
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [riders, setRiders] = useState<{ id: string; name: string }[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await apiGet<{ ready: boolean; items: AdminAnnouncement[]; riders: { id: string; name: string }[] }>(
        "/api/admin/rider-announcements",
      );
      setItems(data.items);
      setRiders(data.riders);
      setReady(data.ready);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void refresh();
  }, [live, refresh]);

  const post = useCallback(
    async (draft: AnnouncementDraft): Promise<boolean> => {
      try {
        await apiSend("/api/admin/rider-announcements", "POST", draft);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await apiSend(`/api/admin/rider-announcements/${id}`, "DELETE");
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [refresh],
  );

  return { live, checked, items, riders, ready, loading, error, refresh, post, remove };
};
