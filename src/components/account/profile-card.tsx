"use client";

import { useState } from "react";
import { IconCheck, IconPhone, IconUser } from "@/components/ui/icons";
import type { CustomerInfo } from "@/lib/customer-session";

export default function ProfileCard({
  customer,
  onSaved,
}: {
  customer: CustomerInfo;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(customer.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "সেভ করা যায়নি।");
      await onSaved();
      setEditing(false);
      setMessage("প্রোফাইল আপডেট হয়েছে।");
    } catch (err) {
      setError(err instanceof Error ? err.message : "সেভ করা যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
      <div className="border-b border-line bg-gradient-to-r from-forest-950 to-forest-800 p-5 text-ivory-50 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300">
          আমার প্রোফাইল
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-50/10 ring-1 ring-ivory-50/20">
            <IconUser className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl">{customer.name}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ivory-200">
              <IconPhone className="h-3.5 w-3.5" /> {customer.phone}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="profile-name" className="text-sm font-semibold text-forest-900">
              আপনার নাম
            </label>
            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setMessage(null);
                }}
                className="min-h-10 rounded-full px-4 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
              >
                নাম পরিবর্তন
              </button>
            )}
          </div>
          {editing ? (
            <div className="mt-2 space-y-3">
              <input
                id="profile-name"
                autoComplete="name"
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-ivory-50 px-4 text-base text-ink outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-100"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || name.trim().length < 2 || name.trim() === customer.name}
                  onClick={() => void save()}
                  className="min-h-11 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "সেভ হচ্ছে…" : "সেভ করুন"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setName(customer.name);
                    setEditing(false);
                    setError(null);
                  }}
                  className="min-h-11 rounded-full px-5 text-sm font-semibold text-ink-soft ring-1 ring-line"
                >
                  বাতিল
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">{customer.name}</p>
          )}
        </div>

        <div className="rounded-xl bg-cream p-4 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            লগইন নম্বর
          </p>
          <p className="mt-1 text-base font-semibold text-forest-900">{customer.phone}</p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            অর্ডার ও অ্যাকাউন্ট এই নম্বরের সাথে যুক্ত, তাই নিরাপত্তার জন্য এখানে পরিবর্তন করা যায় না। নম্বর বদলাতে সাপোর্টে যোগাযোগ করুন।
          </p>
        </div>

        {message && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <IconCheck className="h-4 w-4" /> {message}
          </p>
        )}
        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      </div>
    </section>
  );
}
