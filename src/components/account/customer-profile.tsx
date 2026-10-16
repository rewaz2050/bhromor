"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CustomerInfo } from "@/lib/customer-session";
import { deleteAddress, getSavedAddresses, preferAddress, type SavedAddress } from "@/lib/address-book";
import { addressSyncState, pushAddresses, syncAddresses, type AddressSyncState } from "@/lib/address-sync";
import { samePhone } from "@/lib/orders";
import { useLanguage } from "@/components/i18n/language-provider";
import CustomerPasswordCard from "./customer-password-card";

/* Copy follows the storefront language. Server error text comes back in
   Bangla from the API and is shown as-is. */
const COPY = {
  bn: {
    readFail: "এই ব্রাউজারে ঠিকানা পড়া যাচ্ছে না।",
    removed: "ঠিকানা মুছে ফেলা হয়েছে।",
    preferred: "পরের checkout-এ এই ঠিকানা আগে আসবে।",
    saveFail: "ঠিকানা সেভ হয়নি—ব্রাউজারের storage অনুমতি দেখুন।",
    title: "আমার তথ্য",
    sub: "নিজের নাম আপডেট করুন। লগইন ফোন পরিবর্তনের জন্য সহায়তা নিন।",
    name: "নাম",
    phone: "লগইন ফোন",
    notSaved: "সেভ হয়নি।",
    profileSaved: "প্রোফাইল সেভ হয়েছে।",
    saving: "সেভ হচ্ছে…",
    saveDetails: "তথ্য সেভ করুন",
    syncOffline: "এই ফোন নম্বরের checkout-এ সেভ করা ঠিকানা। এখন শুধু এই ব্রাউজারে আছে—অন্য ডিভাইসে যাবে না।",
    syncOnline: "এই ফোন নম্বরের checkout-এ সেভ করা ঠিকানা। লগ ইন করা থাকলে অন্য ডিভাইসেও পাবেন।",
    empty: "এখনো ঠিকানা সেভ করা হয়নি। অর্ডারের checkout-এ ঠিকানা সেভ করতে পারবেন।",
    savedTitle: "আমার সেভ করা ঠিকানা",
    preferredBadge: "পছন্দের ঠিকানা",
    makePreferred: "পছন্দের ঠিকানা করুন",
    remove: "মুছে ফেলুন",
    confirmRemove: "এই সেভ করা ঠিকানা মুছে ফেলবেন?",
    help: "অ্যাকাউন্ট নিয়ে সহায়তা",
  },
  en: {
    readFail: "This browser can't read your saved addresses.",
    removed: "Address removed.",
    preferred: "This address will come first at your next checkout.",
    saveFail: "The address was not saved — check the browser's storage permission.",
    title: "My details",
    sub: "Update your name. To change your login phone, get help.",
    name: "Name",
    phone: "Login phone",
    notSaved: "Not saved.",
    profileSaved: "Profile saved.",
    saving: "Saving…",
    saveDetails: "Save details",
    syncOffline: "Addresses saved at checkout for this phone number. Right now they only live on this browser — they won't reach other devices.",
    syncOnline: "Addresses saved at checkout for this phone number. If you're signed in, you'll see them on other devices too.",
    empty: "No addresses saved yet. You can save one at checkout.",
    savedTitle: "My saved addresses",
    preferredBadge: "Preferred",
    makePreferred: "Make preferred",
    remove: "Remove",
    confirmRemove: "Remove this saved address?",
    help: "Get help with your account",
  },
} as const;

export function CustomerProfile({ customer, onSaved }: { customer: CustomerInfo; onSaved: () => Promise<void> }) {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const [name, setName] = useState(customer.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [sync, setSync] = useState<AddressSyncState>("idle");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only address storage
      setAddresses(getSavedAddresses().filter(a => samePhone(a.phone, customer.phone)));
    } catch { setError(c.readFail); }
    // The local copy lands first so the list is never blank while the server
    // answers, then the merged book replaces it — that is what makes an
    // address saved on a phone appear on a laptop.
    let live = true;
    void syncAddresses()
      .then((merged) => {
        if (!live) return;
        setAddresses(merged.filter(a => samePhone(a.phone, customer.phone)));
        setSync(addressSyncState());
      })
      .catch(() => { if (live) setSync(addressSyncState()); });
    return () => { live = false; };
    // `c` only changes with the language; the read error is shown once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.phone]);
  const editAddress = (id: string, remove: boolean) => {
    setError(""); setMessage("");
    try {
      if (remove) deleteAddress(id); else preferAddress(id);
      setAddresses(getSavedAddresses().filter(a => samePhone(a.phone, customer.phone)));
      setMessage(remove ? c.removed : c.preferred);
      // The local change is already done and shown; the mirror follows.
      void pushAddresses();
    } catch { setError(c.saveFail); }
  };
  const syncOffline = sync === "signed-out" || sync === "missing-table" || sync === "error";
  return <section className="rounded-2xl border border-line bg-paper p-5 sm:p-7 space-y-6">
    <div><h2 className="font-display text-xl text-forest-900">{c.title}</h2><p className="mt-1 text-sm text-ink-soft">{c.sub}</p></div>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
      try {
        const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || c.notSaved);
        setName(data.customer.name); await onSaved(); setMessage(c.profileSaved);
      } catch (err) { setError(err instanceof Error ? err.message : c.notSaved); }
      finally { setBusy(false); }
    }}>
      <label className="block text-sm">{c.name}<input required minLength={2} maxLength={80} autoComplete="name" disabled={busy} value={name} onChange={e => { setName(e.target.value); setMessage(""); }} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-ivory-50 px-4" /></label>
      <label className="block text-sm">{c.phone}<input readOnly value={customer.phone} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-ivory-100 px-4 text-ink-soft" /></label>
      <button disabled={busy} className="min-h-11 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? c.saving : c.saveDetails}</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-forest-50 p-3 text-sm text-forest-800">{message}</p>}
    <CustomerPasswordCard />
    <div className="border-t border-line pt-5 space-y-3">
      <h3 className="font-semibold text-forest-900">{c.savedTitle}</h3>
      <p className="text-xs text-ink-soft">{syncOffline ? c.syncOffline : c.syncOnline}</p>
      {addresses.length === 0 && <p className="rounded-xl bg-ivory-50 p-4 text-sm text-ink-soft">{c.empty}</p>}
      {addresses.map((a, i) => <article key={a.id} className="rounded-xl border border-line p-4">
        <p className="text-sm font-semibold">{a.label || a.area}{i === 0 && <span className="ml-2 text-xs text-forest-700">{c.preferredBadge}</span>}</p>
        <p className="mt-1 text-sm text-ink-soft">{[a.houseNo, a.roadName, a.area, a.fullAddress].filter(Boolean).join(", ")}</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {i > 0 && <button type="button" className="min-h-11 text-xs font-semibold text-forest-800 underline" onClick={() => editAddress(a.id, false)}>{c.makePreferred}</button>}
          <button type="button" className="min-h-11 text-xs text-rose-700 underline" onClick={() => { if (window.confirm(c.confirmRemove)) editAddress(a.id, true); }}>{c.remove}</button>
        </div>
      </article>)}
      <Link href="/contact" className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">{c.help}</Link>
    </div>
  </section>;
}
