"use client";
import { useState } from "react";
import { VENDOR_PERMISSIONS, VENDOR_PERMISSION_LABELS, type VendorPermission } from "@/lib/vendor-permissions";
import type { VendorStaffMember } from "@/lib/vendor-staff";

export default function StaffPermissions({ member, onSave }: {
  member: VendorStaffMember;
  onSave: (id: string, permissions: VendorPermission[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<readonly string[]>(member.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <details className="w-full rounded-xl border border-line p-3 text-sm">
    <summary className="cursor-pointer font-medium">Delegated permissions — {member.name}</summary>
    <p className="mt-2 text-xs text-ink-soft">Default: Confirm, Preparing and Ready only. These grants never include earnings, payouts, promos, shop settings or team control. Changes are recorded.</p>
    <fieldset disabled={busy} className="mt-3 space-y-2">
      {VENDOR_PERMISSIONS.map((key) => <label key={key} className="flex min-h-10 items-center gap-3">
        <input type="checkbox" checked={selected.includes(key)} onChange={(event) => {
          setSelected((prev) => event.target.checked ? [...prev,key] : prev.filter((value) => value!==key));
          setMessage(null);
        }} />{VENDOR_PERMISSION_LABELS[key]}
      </label>)}
      <button type="button" className="min-h-11 rounded-full px-4 ring-1 ring-forest-800 disabled:opacity-50" onClick={async () => {
        setBusy(true); setMessage(null);
        try { await onSave(member.userId,VENDOR_PERMISSIONS.filter((key) => selected.includes(key))); setMessage("Permissions saved."); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Could not save permissions."); }
        finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save permissions"}</button>
    </fieldset>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </details>;
}
