"use client";

/**
 * Staff team data (admin control center) — live only.
 * Staff accounts are real Supabase Auth users: without a staff session
 * the page says so instead of inventing a team.
 */

import { useCallback, useEffect, useState } from "react";
import type { StaffRole } from "./staff-auth";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export interface StaffMemberClient {
  id: string;
  email: string;
  role: StaffRole;
  emailConfirmed: boolean;
  createdAt: number;
}

export function useStaff() {
  const { live, checked } = useStaffLive();
  const [members, setMembers] = useState<StaffMemberClient[] | null>(null);
  const [me, setMe] = useState<{ email: string; role: StaffRole } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const [team, session] = await Promise.all([
        apiGet<{ staff: StaffMemberClient[] }>("/api/admin/staff"),
        apiGet<{ staff: boolean; role: StaffRole; email: string | null }>(
          "/api/admin/me",
        ),
      ]);
      setMembers(team.staff);
      setMe(
        session.staff && session.email
          ? { email: session.email, role: session.role }
          : null,
      );
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
      setMembers(null);
      setMe(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const grant = useCallback(
    async (email: string, role: StaffRole): Promise<boolean> => {
      try {
        await apiSend("/api/admin/staff", "POST", { email, role });
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [refresh],
  );

  const revoke = useCallback(
    async (email: string): Promise<boolean> => {
      try {
        await apiSend("/api/admin/staff", "DELETE", { email });
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [refresh],
  );

  return {
    live,
    loading: live && (!checked || members === null),
    members: members ?? [],
    me,
    error,
    clearError: () => setError(null),
    grant,
    revoke,
    refresh,
  };
}
