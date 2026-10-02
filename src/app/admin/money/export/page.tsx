"use client";

/**
 * Admin → Money → Export (item Y): any money ledger as a CSV for the
 * accountant. The file is fetched with the staff token and saved by the
 * browser (a plain link would not carry the bearer header).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiDownload, apiErrorMessage } from "@/lib/admin-api";
import { downloadText } from "@/lib/csv";
import { EXPORT_KINDS, EXPORT_LABEL, EXPORT_MAX_DAYS, EXPORT_ROW_CAP, parseExportKind, type ExportKind } from "@/lib/money-export";
import { shiftDay, todayDhaka } from "@/lib/money-daily";

export default function MoneyExportPage() {
  const [today] = useState(() => todayDhaka());
  const [kind, setKind] = useState<ExportKind>("rider_wallet");
  const [from, setFrom] = useState(() => shiftDay(todayDhaka(), -29));
  const [to, setTo] = useState(() => todayDhaka());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Deep link (/admin/money/export?kind=audit) from the audit trail page. Read in an
  // effect, not via useSearchParams — that would force a Suspense boundary on the page.
  useEffect(() => {
    const wanted = parseExportKind(new URLSearchParams(window.location.search).get("kind"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the URL once on mount
    if (wanted) setKind(wanted);
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const qs = new URLSearchParams({ kind, from, to });
      const file = await apiDownload(`/api/admin/money/export?${qs.toString()}`);
      downloadText(file.filename, file.text);
      setDone(
        file.truncated
          ? `${file.filename}: first ${file.rows} rows only — the period has more. Pick a shorter range for the rest.`
          : `${file.filename}: ${file.rows} row${file.rows === 1 ? "" : "s"} saved.`,
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Export for the accountant</h1>
          <p className="mt-1 text-sm text-ink-soft">
            যেকোনো টাকার খাতা CSV হিসেবে নামান — Excel/Sheets-এ খোলে, টাকা ৳ এককে, সময় ঢাকার।
          </p>
        </div>
        <Link href="/admin/money" className="text-sm font-semibold text-forest-800 underline underline-offset-2">
          ← Money
        </Link>
      </header>

      <section className="space-y-4 rounded-2xl bg-paper p-4 ring-1 ring-line">
        <label className="block text-sm font-semibold text-forest-900">
          Ledger
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ExportKind)}
            className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"
          >
            {EXPORT_KINDS.map((k) => (
              <option key={k} value={k}>{EXPORT_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-forest-900">
            From
            <input
              type="date" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold text-forest-900">
            To
            <input
              type="date" value={to} max={today}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>
        <p className="text-[11px] text-ink-soft">
          ঢাকার দিন ধরে, দুই প্রান্তই ধরা হয়। সর্বোচ্চ {EXPORT_MAX_DAYS} দিন ও {EXPORT_ROW_CAP.toLocaleString("en-US")} সারি।
        </p>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !from || !to}
          className="rounded-xl bg-forest-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Download CSV"}
        </button>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {done && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{done}</p>}
      </section>
    </div>
  );
}
