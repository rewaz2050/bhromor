"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CustomerInfo } from "@/lib/customer-session";
import { deleteAddress, getSavedAddresses, preferAddress, type SavedAddress } from "@/lib/address-book";
import { samePhone } from "@/lib/orders";

export function CustomerProfile({ customer, onSaved }: { customer: CustomerInfo; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(customer.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only address storage
      setAddresses(getSavedAddresses().filter(a => samePhone(a.phone, customer.phone)));
    } catch { setError("এই ব্রাউজারে ঠিকানা পড়া যাচ্ছে না।"); }
  }, [customer.phone]);
  const editAddress = (id: string, remove: boolean) => {
    setError(""); setMessage("");
    try {
      if (remove) deleteAddress(id); else preferAddress(id);
      setAddresses(getSavedAddresses().filter(a => samePhone(a.phone, customer.phone)));
      setMessage(remove ? "ঠিকানা মুছে ফেলা হয়েছে।" : "পরের checkout-এ এই ঠিকানা আগে আসবে।");
    } catch { setError("ঠিকানা সেভ হয়নি—ব্রাউজারের storage অনুমতি দেখুন।"); }
  };
  return <section className="rounded-2xl border border-line bg-paper p-5 sm:p-7 space-y-6">
    <div><h2 className="font-display text-xl text-forest-900">আমার তথ্য</h2><p className="mt-1 text-sm text-ink-soft">নিজের নাম আপডেট করুন। লগইন ফোন পরিবর্তনের জন্য সহায়তা নিন।</p></div>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
      try {
        const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "সেভ হয়নি।");
        setName(data.customer.name); await onSaved(); setMessage("প্রোফাইল সেভ হয়েছে।");
      } catch (err) { setError(err instanceof Error ? err.message : "সেভ হয়নি।"); }
      finally { setBusy(false); }
    }}>
      <label className="block text-sm">নাম<input required minLength={2} maxLength={80} autoComplete="name" disabled={busy} value={name} onChange={e => { setName(e.target.value); setMessage(""); }} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-ivory-50 px-4" /></label>
      <label className="block text-sm">লগইন ফোন<input readOnly value={customer.phone} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-ivory-100 px-4 text-ink-soft" /></label>
      <button disabled={busy} className="min-h-11 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "সেভ হচ্ছে…" : "তথ্য সেভ করুন"}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-forest-50 p-3 text-sm text-forest-800">{message}</p>}
    <div className="border-t border-line pt-5 space-y-3">
      <h3 className="font-semibold text-forest-900">আমার সেভ করা ঠিকানা</h3>
      <p className="text-xs text-ink-soft">এই ফোন নম্বরের checkout-এ সেভ করা ঠিকানা। শুধু এই ব্রাউজারে থাকে—অন্য ডিভাইসে নয়।</p>
      {addresses.length === 0 && <p className="rounded-xl bg-ivory-50 p-4 text-sm text-ink-soft">এখনো ঠিকানা সেভ করা হয়নি। অর্ডারের checkout-এ ঠিকানা সেভ করতে পারবেন।</p>}
      {addresses.map((a, i) => <article key={a.id} className="rounded-xl border border-line p-4">
        <p className="text-sm font-semibold">{a.label || a.area}{i === 0 && <span className="ml-2 text-xs text-forest-700">পছন্দের ঠিকানা</span>}</p>
        <p className="mt-1 text-sm text-ink-soft">{[a.houseNo, a.roadName, a.area, a.fullAddress].filter(Boolean).join(", ")}</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {i > 0 && <button type="button" className="min-h-11 text-xs font-semibold text-forest-800 underline" onClick={() => editAddress(a.id, false)}>পছন্দের ঠিকানা করুন</button>}
          <button type="button" className="min-h-11 text-xs text-rose-700 underline" onClick={() => { if (window.confirm("এই সেভ করা ঠিকানা মুছে ফেলবেন?")) editAddress(a.id, true); }}>মুছে ফেলুন</button>
        </div>
      </article>)}
      <Link href="/contact" className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">অ্যাকাউন্ট নিয়ে সহায়তা</Link>
    </div>
  </section>;
}
