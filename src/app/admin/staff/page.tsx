"use client";

import { useState } from "react";
import { useStaff } from "@/lib/use-staff";
import type { StaffRole } from "@/lib/staff-auth";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconPlus, IconShield } from "@/components/ui/icons";

const ROLE_BADGE: Record<StaffRole, string> = {
  manager: "bg-ivory-200 text-ink-soft",
  admin: "bg-emerald-100 text-emerald-800",
  super_admin: "bg-forest-800 text-ivory-50",
};

const ROLE_HELP: Record<StaffRole, string> = {
  manager: "Daily operations — orders, catalog, queues. Cannot manage staff.",
  admin: "Full operations + manage managers and admins. Cannot touch super_admins.",
  super_admin: "Everything, including other super_admins. Keep this tiny.",
};

const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Admin control center — who is staff, who can do what. */
export default function AdminStaffPage() {
  const { live, loading, members, me, error, clearError, grant, revoke } =
    useStaff();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("manager");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const submit = async () => {
    const cleaned = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setFormError("Enter a valid email address.");
      return;
    }
    setSaving(true);
    const ok = await grant(cleaned, role);
    setSaving(false);
    if (!ok) return;
    setEmail("");
    setFormError(null);
  };

  const onRevoke = async (target: string) => {
    if (
      !window.confirm(
        `Revoke staff access for ${target}? They lose the admin dashboard immediately.`,
      )
    ) {
      return;
    }
    setRevoking(target);
    await revoke(target);
    setRevoking(null);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading staff">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  if (!live) {
    return (
      <div className="rounded-2xl bg-paper p-8 text-center ring-1 ring-line">
        <h2 className="font-display text-xl text-forest-900">
          Staff needs live mode
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          Staff accounts are real — sign in with an admin account to see the
          team and manage access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-medium text-forest-900">
          Staff
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
          Who can open this dashboard and what they may touch. Grants apply to
          existing accounts only — the person signs up first, then you grant
          the role here.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200"
        >
          {error}{" "}
          <button
            type="button"
            onClick={clearError}
            className="underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}

      <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-forest-900">
          <IconPlus className="h-4 w-4" /> Grant or change a role
        </h3>
        {formError && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200"
          >
            {formError}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
          <label className="block">
            <span className={label}>Account email</span>
            <input
              className={field}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              aria-label="Account email"
            />
          </label>
          <label className="block">
            <span className={label}>Role</span>
            <select
              className={field}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-5 py-2.5 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-60"
            >
              <IconCheck className="h-3.5 w-3.5" />{" "}
              {saving ? "Saving…" : "Grant"}
            </button>
          </div>
        </div>
        <p className={hint}>{ROLE_HELP[role]}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-paper ring-1 ring-line">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Access since</th>
              <th className="px-4 py-3 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe =
                me !== null &&
                m.email.toLowerCase() === me.email.toLowerCase();
              return (
                <tr
                  key={m.id}
                  className="border-b border-line/60 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-forest-900">
                      {m.email}
                      {isMe && (
                        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-gold-700">
                          You
                        </span>
                      )}
                      {!m.emailConfirmed && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-900">
                          Unconfirmed
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${ROLE_BADGE[m.role]}`}
                    >
                      {m.role === "super_admin" && (
                        <IconShield className="h-3 w-3" />
                      )}
                      {m.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft">
                    {fmtDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isMe ? (
                      <span className="text-xs text-ink-soft">
                        Your own access stays put
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={revoking === m.email}
                        onClick={() => void onRevoke(m.email)}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {revoking === m.email ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && !error && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-ink-soft"
                >
                  No staff rows yet — grant the first role above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="rounded-xl bg-ivory-100 px-4 py-3 text-xs leading-5 text-ink-soft">
        Guardrails: nobody edits their own role, only a super_admin touches
        super_admins, and the last super_admin cannot be demoted or revoked
        until a successor exists.
      </p>
    </div>
  );
}
