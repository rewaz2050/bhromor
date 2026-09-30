"use client";

/**
 * C1 (2026-09-28) — who else can open this shop.
 *
 * The owner's hands were tied before this: only PROSANTI could open a vendor
 * login, so a busy shop either shared the OWNER's password (which also opens
 * payouts and the shop's profile) or left the counter unmanned.
 *
 * Three things the screen says out loud, because they are the part a shop
 * gets wrong:
 *   • the password is shown ONCE — there is no e-mail or SMS here, so it is
 *     handed over in person, and the person changes it in their own settings;
 *   • revoking closes the door to this shop and leaves the person's account
 *     alone (it may be a customer's or a rider's login too);
 *   • the roster is capped, so a shop cannot end up with a dozen keys.
 *
 * Presentational + plain props: the page supplies the fetches, so the rules
 * and the copy are testable without a network.
 */

import { useState } from "react";
import {
  VENDOR_STAFF_MAX,
  staffAddedOn,
  staffLoginLabel,
  staffSlotsLeft,
  validateStaffInput,
  type VendorStaffMember,
} from "@/lib/vendor-staff";

export default function StaffCard({
  staff,
  onCreate,
  onRevoke,
  onResetPassword,
}: {
  staff: VendorStaffMember[];
  onCreate: (input: {
    name: string;
    login: string;
  }) => Promise<{ password: string; staff: VendorStaffMember }>;
  onRevoke: (userId: string) => Promise<void>;
  onResetPassword: (userId: string) => Promise<string>;
}) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oneTime, setOneTime] = useState<{ who: string; password: string } | null>(null);

  const slots = staffSlotsLeft(staff);
  const checked = validateStaffInput({ name, login });

  const add = async () => {
    if (!checked.ok) {
      setError(Object.values(checked.errors)[0] ?? "Check the name and login.");
      return;
    }
    setSaving(true);
    setError(null);
    setOneTime(null);
    try {
      const result = await onCreate({ name: checked.value.name, login: login.trim() });
      // The password exists in exactly one response: keep it in view until the
      // owner says they have passed it on, then forget it.
      setOneTime({ who: result.staff.name, password: result.password });
      setName("");
      setLogin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that login — try again.");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (member: VendorStaffMember) => {
    setBusyId(member.userId);
    setError(null);
    try {
      await onRevoke(member.userId);
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke that login.");
    } finally {
      setBusyId(null);
    }
  };

  const newPassword = async (member: VendorStaffMember) => {
    setBusyId(member.userId);
    setError(null);
    try {
      const password = await onResetPassword(member.userId);
      setOneTime({ who: member.name, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset that password.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label="Staff logins"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="staff-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Staff logins
        </h3>
        <span className="text-[0.62rem] text-ink-soft" data-testid="staff-slots">
          {slots} of {VENDOR_STAFF_MAX} free
        </span>
      </div>

      {/* What a staff login actually may do, said plainly: the counter's work
          is theirs, the shop's identity is not. */}
      <p className="mt-2 text-[0.68rem] leading-5 text-ink-soft">
        A staff login can work the orders, edit products and run promos. It cannot change the
        shop&apos;s profile, book a holiday, or open another login — those stay with you. It can
        never become an owner.
      </p>

      <ul className="mt-4 divide-y divide-line" data-testid="staff-list">
        {staff.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-ink">
                {member.name}
                {member.isYou && <span className="ml-1 text-xs font-normal text-ink-soft">(you)</span>}
              </span>
              <span className="block text-xs text-ink-soft">
                {staffLoginLabel(member.loginEmail)} · {member.role === "owner" ? "Owner" : "Staff"}
                {staffAddedOn(member.addedAt) && ` · added ${staffAddedOn(member.addedAt)}`}
              </span>
            </span>
            {member.role === "staff" && (
              <span className="flex items-center gap-3">
                {confirmId === member.userId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void revoke(member)}
                      disabled={busyId === member.userId}
                      data-testid={`staff-revoke-yes-${member.userId}`}
                      className="text-xs font-semibold text-red-700 underline underline-offset-2 disabled:opacity-50"
                    >
                      {busyId === member.userId ? "Revoking…" : "Yes, revoke"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="text-xs font-semibold text-ink-soft underline underline-offset-2"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void newPassword(member)}
                      disabled={busyId === member.userId}
                      data-testid={`staff-password-${member.userId}`}
                      className="text-xs font-semibold text-forest-800 underline underline-offset-2 disabled:opacity-50"
                    >
                      {busyId === member.userId ? "Working…" : "New password"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(member.userId)}
                      data-testid={`staff-revoke-${member.userId}`}
                      className="text-xs font-semibold text-red-700 underline underline-offset-2"
                    >
                      Revoke
                    </button>
                  </>
                )}
              </span>
            )}
          </li>
        ))}
        {staff.length === 0 && (
          <li className="py-2.5 text-sm text-ink-soft">
            Nobody yet — the shop is yours alone.
          </li>
        )}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Their name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, 60));
              setError(null);
            }}
            placeholder="Samina"
            data-testid="staff-name"
            className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">
            Mobile number or email they will sign in with
          </span>
          <input
            value={login}
            onChange={(e) => {
              setLogin(e.target.value.slice(0, 160));
              setError(null);
            }}
            placeholder="01712345678"
            data-testid="staff-login"
            className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line focus:ring-2 focus:ring-forest-500"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void add()}
          disabled={saving || slots === 0 || !checked.ok}
          data-testid="staff-add"
          className="rounded-full bg-forest-800 px-5 py-2 text-xs font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-40"
        >
          {saving ? "Opening…" : "Open a staff login"}
        </button>
        {!checked.ok && (
          <span className="text-xs text-ink-soft" data-testid="staff-hint">
            {Object.values(checked.errors)[0]}
          </span>
        )}
        {slots === 0 && (
          <span className="text-xs text-amber-800" data-testid="staff-full">
            All {VENDOR_STAFF_MAX} staff logins are taken — revoke one to open another.
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs font-medium text-red-700">
            {error}
          </span>
        )}
      </div>

      {oneTime && (
        <div
          data-testid="staff-onetime"
          className="mt-4 rounded-xl bg-forest-50 p-4 ring-1 ring-forest-200"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-900">
            One-time password for {oneTime.who}
          </p>
          <p
            data-testid="staff-onetime-password"
            className="mt-1 font-mono text-lg tracking-wider text-forest-900"
          >
            {oneTime.password}
          </p>
          <p className="mt-1 text-[0.68rem] leading-5 text-forest-900">
            Give it to them — it is shown once and never again. They sign in at /vendor/login with
            their number or e-mail, then change it in Settings → Password.
          </p>
          <button
            type="button"
            onClick={() => setOneTime(null)}
            data-testid="staff-onetime-done"
            className="mt-2 text-xs font-semibold text-forest-800 underline underline-offset-2"
          >
            I have passed it on
          </button>
        </div>
      )}

      <p className="mt-3 text-[0.62rem] leading-5 text-ink-soft">
        Revoking only closes the door to this shop — the person&apos;s PROSANTI login, orders and
        parcels stay theirs.
      </p>
    </section>
  );
}
