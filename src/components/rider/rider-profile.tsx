"use client";
import { useState } from "react";
import type { Rider } from "@/lib/catalog";
import { useLiveZones } from "@/lib/use-live-zones";
import ChangePasswordCard from "@/components/account/change-password-card";

export function RiderProfile({ rider, onSaved }: { rider: Rider; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(rider.name);
  const [phone, setPhone] = useState(rider.phone);
  const [vehicle, setVehicle] = useState(rider.vehicle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const { zones } = useLiveZones();
  const zoneNames = rider.zoneIds.map((id) => zones.find((z) => z.id === id)?.name ?? id);
  const field = "mt-1 w-full rounded-xl border border-line bg-paper p-3 text-sm";
  return <details className="rounded-2xl border border-line bg-paper p-4">
    <summary className="cursor-pointer text-sm font-semibold text-forest-900">আমার রাইডার প্রোফাইল</summary>
    <p className="mt-3 text-xs text-ink-soft">অনুমোদিত রাইডার · এলাকা: {zoneNames.join(", ") || "এলাকা নির্ধারণ বাকি"}</p>
    <form className="mt-4 space-y-3" onChange={() => setSaved(false)} onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError(""); setSaved(false);
      try {
        const res = await fetch("/api/rider/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, vehicle }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "সেভ হয়নি।");
        setName(data.rider.name); setPhone(data.rider.phone); setVehicle(data.rider.vehicle);
        await onSaved(); setSaved(true);
      } catch (err) { setError(err instanceof Error ? err.message : "সেভ হয়নি।"); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-xs">নাম<input className={field} required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block text-xs">ফোন<input className={field} required type="tel" inputMode="tel" pattern="01[0-9]{9}" maxLength={11} autoComplete="tel-national" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label className="block text-xs">যানবাহন<select className={field} value={vehicle} onChange={e => setVehicle(e.target.value as Rider["vehicle"])}><option value="bicycle">সাইকেল</option><option value="bike">মোটরবাইক</option><option value="scooter">স্কুটার</option></select></label>
        <button className="min-h-11 rounded-full bg-forest-800 px-5 text-sm text-white disabled:opacity-50" disabled={busy}>{busy ? "সেভ হচ্ছে…" : "প্রোফাইল সেভ করুন"}</button>
      </fieldset>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {saved && <p role="status" className="text-xs text-forest-800">প্রোফাইল সেভ হয়েছে।</p>}
    </form>
    <p className="mt-3 text-xs text-ink-soft">এলাকা, অনুমোদন ও হিসাব শুধু Admin বদলাতে পারবেন। কাজের সময় নিচে বেছে নিন।</p>
    <ChangePasswordCard className="mt-4" />
  </details>;
}
