"use client";

/**
 * What the signed-in staff member may reach (permission matrix —
 * docs/SECURITY-HARDENING.md, 2026-10-09).
 *
 * Convenience, not a lock. Every gated route re-checks the role server-side
 * and answers 403, so a manager who calls one directly is stopped whether or
 * not the button was on screen. Hiding the button only saves a click that
 * could never work — and the confusion of reading why it failed.
 */

import { useStaffLive } from "./use-staff-live";

export type StaffRoleName = "manager" | "admin" | "super_admin";

/** The roles that hold money, logins and vetting. `manager` does not. */
export const canManageRole = (role: string | null): boolean =>
  role === "admin" || role === "super_admin";

export const useStaffRole = (): {
  role: StaffRoleName | null;
  checked: boolean;
  live: boolean;
  canManage: boolean;
} => {
  const { role, checked, live } = useStaffLive();
  return {
    role: (role ?? null) as StaffRoleName | null,
    checked,
    live,
    canManage: canManageRole(role),
  };
};
