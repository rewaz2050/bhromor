"use client";

import { useRef, useState } from "react";

export default function ProductCsvTools() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const importFile = async () => {
    const file = input.current?.files?.[0];
    if (!file) {
      setNotice("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const csv = await file.text();
      const response = await fetch("/api/vendor/products/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const result = (await response.json()) as {
        imported?: number;
        updated?: number;
        failed?: { line: number; message: string }[];
        error?: string;
      };
      if (!response.ok) {
        const detail = result.failed?.map((row) => `Line ${row.line}: ${row.message}`).join(" ");
        setNotice(detail || result.error || "CSV could not be imported.");
      } else {
        const failed = result.failed ?? [];
        const summary = `${result.imported ?? 0} added as drafts, ${result.updated ?? 0} updated.`;
        setNotice(failed.length ? `${summary} ${failed.length} row(s) need attention: ${failed.map((row) => `line ${row.line}: ${row.message}`).join("; ")}` : summary);
        if ((result.imported ?? 0) + (result.updated ?? 0) > 0) window.location.reload();
      }
    } catch {
      setNotice("Could not read or send that file. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="product-csv-title" className="mb-5 rounded-2xl bg-paper p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="product-csv-title" className="text-sm font-bold text-forest-900">Catalog CSV</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-soft">
            Download your shop’s products or import up to 100 rows. Existing SKUs update; new SKUs are added as drafts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- native navigation triggers the CSV attachment download */}
          <a href="/api/vendor/products/csv" className="inline-flex min-h-10 items-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-white hover:bg-forest-900">Export CSV</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- native navigation triggers the CSV attachment download */}
          <a href="/api/vendor/products/csv?template=1" className="inline-flex min-h-10 items-center rounded-full bg-paper px-4 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50">Blank template</a>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="product-csv-file">Choose product CSV</label>
        <input ref={input} id="product-csv-file" type="file" accept=".csv,text/csv" className="max-w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-ivory-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-forest-900" />
        <button type="button" disabled={busy} onClick={importFile} className="inline-flex min-h-10 items-center rounded-full bg-ivory-100 px-4 text-xs font-semibold text-forest-900 ring-1 ring-line hover:bg-ivory-200 disabled:opacity-50">
          {busy ? "Importing…" : "Import CSV"}
        </button>
      </div>
      {notice && <p role="status" className="mt-3 text-xs font-medium text-forest-900">{notice}</p>}
    </section>
  );
}
