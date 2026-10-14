"use client";

/**
 * Renders an admin-only control only for the roles that may use it
 * (permission matrix — docs/SECURITY-HARDENING.md).
 *
 * A manager running daily operations meets a dozen buttons that answer 403.
 * That is not a security problem — the API is the lock and always was — it is
 * a person clicking something that cannot work and reading a red sentence
 * about why. This hides those controls instead, and optionally says what is
 * missing so the page does not look broken.
 *
 * Deliberately renders nothing until the session probe has answered: showing
 * a button and then taking it away is worse than one beat of empty space.
 */

import type { ReactNode } from "react";
import { useStaffRole } from "@/lib/use-staff-role";

export default function AdminOnly({
  children,
  note,
}: {
  /** Omit to use this as a manager-only notice banner. */
  children?: ReactNode;
  /** Shown to a manager in place of the control. Omit to hide silently. */
  note?: string;
}) {
  const { canManage, checked } = useStaffRole();
  if (!checked) return null;
  if (!canManage) {
    if (!note) return null;
    return (
      <p
        data-testid="admin-only-note"
        className="rounded-xl bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-soft ring-1 ring-line"
      >
        {note}
      </p>
    );
  }
  return <>{children ?? null}</>;
}
