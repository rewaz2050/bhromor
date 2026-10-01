"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatBdt } from "@/lib/format";
import type { RiderJob } from "@/lib/db/riders";

export default function RiderHistoryPage() {
  const [jobs, setJobs] = useState<RiderJob[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "delivered" | "cancelled">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/rider/history?search=${encodeURIComponent(search)}`, { cache: "no-store" })
        .then(async (response) => { if (!response.ok) throw new Error("History could not load."); return response.json() as Promise<{ jobs: RiderJob[] }>; })
        .then((data) => { if (!cancelled) { setJobs(data.jobs); setError(null); } })
        .catch((err: Error) => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search]);
  const visible = jobs.filter((job) => status === "all" || job.state === status);
  return <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Rider portal</p><h1 className="font-display text-2xl text-forest-900">Trip history</h1></div><Link href="/rider" className="text-sm font-semibold text-forest-800 underline">← Dashboard</Link></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order number" className="rounded-xl bg-paper px-4 py-3 text-sm ring-1 ring-line"/><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-xl bg-paper px-4 py-3 text-sm ring-1 ring-line"><option value="all">All trips</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></div>
    {loading ? <p className="rounded-xl bg-paper p-5 text-sm text-ink-soft">Loading history…</p> : error ? <p role="alert" className="rounded-xl bg-rose-50 p-5 text-sm text-rose-900">{error}</p> : visible.length === 0 ? <p className="rounded-xl bg-paper p-5 text-sm text-ink-soft">No trips found.</p> : <ul className="space-y-3">{visible.map((job) => <li key={job.id} className="rounded-2xl bg-paper p-4 ring-1 ring-line"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-forest-900">{job.order.id}</p><p className="text-xs text-ink-soft">{job.order.customer.area} · {job.state}</p></div><div className="text-right"><p className="font-semibold text-forest-900">{formatBdt(job.earningsPaisa ?? 0)}</p><p className="text-[10px] text-ink-soft">trip earning</p></div></div></li>)}</ul>}
  </main>;
}
