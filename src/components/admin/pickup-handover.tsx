"use client";

import { useState } from "react";

import { PICKUP_LOCATION_LINE } from "@/lib/pickup-location";
import { OVERRIDE_REASON_MAX, OVERRIDE_REASON_MIN, validOverrideReason } from "@/lib/shop-fulfilment";
import { useStaffRole } from "@/lib/use-staff-role";

/**
 * The approved pickup counter is Traffic Point (src/lib/pickup-location.ts) —
 * never the shop's own address. The expected code is never loaded.
 *
 * The normal handover is the PIN. A customer who no longer has the confirmation
 * (other device, cleared history) would otherwise be locked out of their own
 * parcel forever, so Admin/Super Admin get one explicit exception: a reason,
 * written into the order timeline with their name, and no PIN re-issue or
 * display anywhere. The two forms are siblings, never nested.
 */
export default function PickupHandover({
  verify,
  override,
}: {
  verify: (code: string) => Promise<boolean>;
  override: (reason: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const { checked, canManage } = useStaffRole();

  return (
    <div className="space-y-3">
      <form
        className="space-y-3 rounded-xl border border-line p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !/^[0-9]{4}$/.test(code)) return;
          setBusy(true);
          try {
            if (await verify(code)) setCode("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-ink-soft">
          {PICKUP_LOCATION_LINE} — ask the customer for their PIN. / কাস্টমারের PIN নিয়ে যাচাই করে পার্সেল দিন।
        </p>
        <label className="block text-sm font-medium" htmlFor="pickup-pin">
          Customer PIN / কাস্টমারের PIN
        </label>
        <input
          id="pickup-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          pattern="[0-9]{4}"
          maxLength={4}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
          disabled={busy}
          className="min-h-11 w-36 rounded-lg border border-line bg-paper px-3 font-mono tracking-widest"
        />
        <button
          type="submit"
          disabled={busy || !/^[0-9]{4}$/.test(code)}
          className="ml-3 min-h-11 rounded-lg bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-50"
        >
          {busy ? "Verifying… / যাচাই হচ্ছে…" : "Verify PIN & hand over"}
        </button>
        <p className="text-xs text-ink-soft">
          The server checks the PIN; the stored code is never shown to staff. / সংরক্ষিত PIN staff-কে দেখানো হয় না।
        </p>
      </form>

      {checked && canManage && (
        <details className="rounded-xl bg-ivory-100/70 p-4 ring-1 ring-line">
          <summary className="cursor-pointer text-sm font-semibold text-forest-900">
            Customer lost the confirmation? / রশিদ হারিয়ে গেছে?
          </summary>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            The PIN is never re-issued or shown, so a handover without it is an exception — Admin or Super Admin
            only, with your reason written into the order timeline next to your name. Do this only with the
            customer in front of you. / PIN কখনো নতুন করে দেওয়া বা দেখানো হয় না — শুধু Admin/Super Admin, কারণ সহ।
          </p>
          <form
            className="mt-3 space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (overrideBusy || !validOverrideReason(reason)) return;
              if (!window.confirm("Hand this parcel over without the customer's PIN? The reason is recorded.")) return;
              setOverrideBusy(true);
              setOverrideError(null);
              try {
                if (await override(reason.trim())) setReason("");
                else setOverrideError("Override failed. Check the order error and refresh before trying again.");
              } catch {
                setOverrideError("Override failed. Refresh and check the current order status.");
              } finally {
                setOverrideBusy(false);
              }
            }}
          >
            <label className="block text-sm font-medium" htmlFor="pickup-override-reason">
              Reason / কারণ
            </label>
            <textarea
              id="pickup-override-reason"
              required
              minLength={OVERRIDE_REASON_MIN}
              maxLength={OVERRIDE_REASON_MAX}
              rows={3}
              value={reason}
              disabled={overrideBusy}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="pickup-override-help"
              className="block w-full rounded-xl border border-line bg-paper p-3 text-sm"
            />
            <p id="pickup-override-help" className="text-xs text-ink-soft">
              10–300 characters. Say how you verified the customer; never write the PIN or payment details here.
            </p>
            {overrideError && (
              <p role="alert" className="text-sm text-rose-800">
                {overrideError}
              </p>
            )}
            <button
              type="submit"
              disabled={overrideBusy || !validOverrideReason(reason)}
              className="min-h-11 rounded-lg px-4 text-sm font-semibold text-rose-800 ring-1 ring-rose-300 disabled:opacity-50"
            >
              {overrideBusy ? "Recording override… / রেকর্ড হচ্ছে…" : "Hand over with recorded reason"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
