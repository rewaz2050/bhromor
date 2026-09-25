"use client";
import { useState } from "react";
import type { Rider } from "@/lib/catalog";
import { useLiveZones } from "@/lib/use-live-zones";

export function RiderProfile({ rider, onSaved }: { rider: Rider; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(rider.name);
  const [phone, setPhone] = useState(rider.phone);
  const [vehicle, setVehicle] = useState(rider.vehicle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const { zones } = useLiveZones();
  const zoneNames = rider.zoneIds.map((id) => zones.find((z) => z.id === id)?.name ?? id);
  // The parent remounts only when the rider id changes (key={id}) — a refetch
  // that returns a newer name/phone for the SAME rider used to leave this
  // form painting stale values forever. Adopt server values on change, but
  // never clobber text the rider already typed (render-phase adjustment, the
  // sanctioned "props changed, state follows" pattern — no effect).
  const [synced, setSynced] = useState({ name: rider.name, phone: rider.phone, vehicle: rider.vehicle });
  const serverMoved =
    rider.name !== synced.name || rider.phone !== synced.phone || rider.vehicle !== synced.vehicle;
  const userEditing =
    name !== synced.name || phone !== synced.phone || vehicle !== synced.vehicle;
  if (serverMoved && !userEditing && !busy) {
    setSynced({ name: rider.name, phone: rider.phone, vehicle: rider.vehicle });
    setName(rider.name);
    setPhone(rider.phone);
    setVehicle(rider.vehicle);
  }
  const field = "mt-1 w-full rounded-xl border border-line bg-paper p-3 text-sm";
  return <details className="rounded-2xl border border-line bg-paper p-4">
    <summary className="cursor-pointer text-sm font-semibold text-forest-900">আমার রাইডার প্রোফাইল</summary>
    <p className="mt-3 text-xs text-ink-soft">অনুমোদিত রাইডার · এলাকা: {zoneNames.join(", ") || "এলাকা নির্ধারণ বাকি"}</p>
    {rider.contactEmail ? (
      <p className="mt-1 text-xs text-ink-soft">লগইন ইমেইল: {rider.contactEmail} (পরিবর্তন করতে Admin-কে বলুন)</p>
    ) : null}
    <form className="mt-4 space-y-3" onChange={() => setSaved(false)} onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError(""); setSaved(false);
      try {
        const cleanPhone = phone.trim().replace(/[\s-]/g, "");
        if (name.trim().length < 2) throw new Error("নাম ২–৮০ অক্ষরের হতে হবে।");
        if (!/^01[0-9]{9}$/.test(cleanPhone)) throw new Error("১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
        const res = await fetch("/api/rider/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), phone: cleanPhone, vehicle }) });
        const data = (await res.json().catch(() => null)) as { rider?: Rider; error?: string } | null;
        if (!res.ok) throw new Error(data?.error || "সেভ হয়নি — আবার চেষ্টা করুন।");
        if (!data?.rider) throw new Error("সেভ হয়নি — আবার চেষ্টা করুন।");
        setName(data.rider.name); setPhone(data.rider.phone); setVehicle(data.rider.vehicle);
        setSynced({ name: data.rider.name, phone: data.rider.phone, vehicle: data.rider.vehicle });
        await onSaved(); setSaved(true);
      } catch (err) { setError(err instanceof Error ? err.message : "সেভ হয়নি।"); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-xs">নাম<input className={field} required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block text-xs">ফোন<input className={field} required type="tel" inputMode="tel" pattern="01[0-9]{9}" maxLength={11} autoComplete="tel-national" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label className="block text-xs">যানবাহন<select className={field} value={vehicle} onChange={e => setVehicle(e.target.value as Rider["vehicle"])}><option value="bicycle">সাইকেল</option><option value="bike">মোটরবাইক</option><option value="scooter">স্কুটার</option></select></label>
        <button className="min-h-11 rounded-full bg-forest-800 px-5 text-sm text-white disabled:opacity-50" disabled={busy}>{busy ? "সেভ হচ্ছে…" : "প্রোফাইল সেভ করুন"}</button>
      </fieldset>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {saved && <p role="status" className="text-xs text-forest-800">প্রোফাইল সেভ হয়েছে।</p>}
    </form>
    <p className="mt-3 text-xs text-ink-soft">এলাকা, অনুমোদন ও হিসাব শুধু Admin বদলাতে পারবেন। কাজের সময় নিচে বেছে নিন।</p>
  </details>;
}
