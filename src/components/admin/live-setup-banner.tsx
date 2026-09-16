"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCheck, IconShield } from "@/components/ui/icons";

interface HealthResponse {
  live: boolean;
  checks?: Record<string, boolean>;
  counts?: Record<string, number>;
  nextSteps?: string[];
}

/**
 * GO-LIVE banner for the admin dashboard.
 * Green chip when the backend is fully live; otherwise an actionable
 * checklist of exactly what is missing. Reads the same probe as /api/health.
 */
export default function LiveSetupBanner() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: HealthResponse) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) return null;

  if (health.live) {
    // 202609160004 does not gate `live` (orders flow without it) but the
    // shop is exposed until it runs — say so next to the green chip.
    const securityPending = health.checks?.securityRepair === false;
    // 202609160005 likewise: orders flow, but dispatch breaks the first time
    // an offer lapses/rejects with a second rider online.
    const dispatchPending = health.checks?.dispatchRepair === false;
    return (
      <div className="mb-8 space-y-3">
        <div className="flex items-center gap-2.5 rounded-2xl bg-forest-50 px-4 py-3 ring-1 ring-forest-200">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-800 text-ivory-50">
            <IconCheck className="h-3.5 w-3.5 stroke-[3]" />
          </span>
          <p className="text-sm font-semibold text-forest-900">
            LIVE — সব ডেটা Supabase থেকে চলছে (অর্ডার, নোটিফিকেশন, ক্যাটালগ, জোন)
          </p>
          <Link
            href="/api/health"
            target="_blank"
            className="ml-auto text-xs font-medium text-forest-700 underline underline-offset-2"
          >
            health report
          </Link>
        </div>
        {securityPending && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <IconShield className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 text-sm leading-6 text-amber-900">
              <p className="font-semibold">
                🔒 সিকিউরিটি লক বাকি — ব্রাউজারের public key দিয়ে এখনো ডেটাবেসের কিছু RPC সরাসরি কল করা যায়
              </p>
              <p className="mt-0.5 text-[13px] text-amber-900/90">
                অর্ডার চলছে, কিন্তু যে কেউ delivery slot ভরে দিতে, coupon শেষ করে দিতে বা PROSANTI+ আবেদন পড়তে পারে। ঠিক করতে <strong>একটা</strong> SQL ফাইল Supabase → SQL Editor-এ পেস্ট করে Run করুন (৩টা <strong>OK</strong> দেখাবে):
              </p>
              <code className="mt-1.5 block rounded-xl bg-white/80 px-3.5 py-2 text-xs font-mono text-amber-900 ring-1 ring-amber-200">
                supabase/migrations/202609160004_rpc_grants_rls_repair.sql
              </code>
            </div>
          </div>
        )}
        {dispatchPending && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <IconShield className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 text-sm leading-6 text-amber-900">
              <p className="font-semibold">
                🛵 ডেলিভারি re-offer ফিক্স বাকি — একটা offer expire বা reject হলেই rider app-এর job list বন্ধ হয়ে যাবে
              </p>
              <p className="mt-0.5 text-[13px] text-amber-900/90">
                ডেটাবেসে প্রতি অর্ডারে একটাই assignment row রাখা যায়, তাই দ্বিতীয় rider-কে offer করার চেষ্টা fail করে (rider job feed 503, Admin → Deliveries batch assign কাজ করে না)। ঠিক করতে <strong>একটা</strong> SQL ফাইল Supabase → SQL Editor-এ পেস্ট করে Run করুন (৩টা <strong>OK</strong> দেখাবে):
              </p>
              <code className="mt-1.5 block rounded-xl bg-white/80 px-3.5 py-2 text-xs font-mono text-amber-900 ring-1 ring-amber-200">
                supabase/migrations/202609160005_dispatch_reoffer_repair.sql
              </code>
            </div>
          </div>
        )}
      </div>
    );
  }

  const steps = health.nextSteps ?? [];
  const c = health.checks ?? {};
  const baseLive =
    c.supabaseKeys && c.serviceRoleKey && c.reachable && c.productsSeeded &&
    c.zonesSeeded && c.shopsSeeded && c.adminUser && c.placeOrderRpc;
  const onlyRepairMissing = baseLive && c.checkoutRepair === false;
  const onlyFlowRepairMissing =
    baseLive && c.checkoutRepair === true && c.orderFlowRepair === false;

  if (onlyFlowRepairMissing) {
    // Orders arrive but the shop cannot move them: Confirm / Cancel, bKash
    // verify and the rider's Delivered are all refused by the database.
    return (
      <div className="mb-8 rounded-2xl bg-rose-50 p-5 ring-1 ring-rose-200">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
            <IconShield className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-rose-900">
              🚨 অর্ডার আসছে, কিন্তু কোনো অর্ডার Confirm / Cancel / Deliver হচ্ছে না
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-rose-900/90">
              ডেটাবেসের একটা trigger প্রতিটা status পরিবর্তন আটকে দিচ্ছে (ledger trigger-এ enum তুলনা), bKash/Nagad verify-এর RPC ভাঙা, আর rider-এর Delivered বাটন guard-এ আটকে।
              ঠিক করতে <strong>একটা</strong> SQL ফাইল Supabase → SQL Editor-এ পেস্ট করে Run করুন:
            </p>
            <code className="mt-2 block rounded-xl bg-white/80 px-3.5 py-2.5 text-xs font-mono text-rose-900 ring-1 ring-rose-200">
              supabase/migrations/202609160003_order_status_update_repair.sql
            </code>
            <p className="mt-2 text-[11px] text-rose-800/80">
              কয়েক সেকেন্ড লাগে, বারবার চালানো নিরাপদ, শেষে ৪টা <strong>OK</strong> দেখাবে। তারপর এই পেজ রিফ্রেশ করলে সবুজ LIVE চিপ আসবে।{" "}
              <Link href="/api/health" target="_blank" className="underline font-medium">/api/health</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (onlyRepairMissing) {
    // Everything is live EXCEPT the order INSERT path — every checkout is
    // answering "Could not place the order". One SQL paste fixes it.
    return (
      <div className="mb-8 rounded-2xl bg-rose-50 p-5 ring-1 ring-rose-200">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
            <IconShield className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-rose-900">
              🚨 চেকআউট বন্ধ — কাস্টমার এখন কোনো অর্ডার দিতে পারছে না
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-rose-900/90">
              ডেটাবেসে অর্ডার INSERT আটকে যাচ্ছে (<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-mono">orders.gift_wrap</code> NOT NULL + পুরনো guard trigger)।
              ঠিক করতে <strong>একটা</strong> SQL ফাইল Supabase → SQL Editor-এ পেস্ট করে Run করুন:
            </p>
            <code className="mt-2 block rounded-xl bg-white/80 px-3.5 py-2.5 text-xs font-mono text-rose-900 ring-1 ring-rose-200">
              supabase/migrations/202609160002_order_insert_repair.sql
            </code>
            <p className="mt-2 text-[11px] text-rose-800/80">
              কয়েক সেকেন্ড লাগে, বারবার চালানো নিরাপদ, শেষে ৩টা <strong>OK</strong> দেখাবে। তারপর এই পেজ রিফ্রেশ করলে সবুজ LIVE চিপ আসবে।{" "}
              <Link href="/api/health" target="_blank" className="underline font-medium">/api/health</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <IconShield className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-amber-900">
            ⚠️ ব্যাকএন্ড এখনো পুরোপুরি লাইভ নয় — লাইভ করতে নিচের ধাপগুলো (মাত্র ~১০ মিনিট)
          </h3>
          <ol className="mt-2.5 space-y-1.5 text-sm leading-6 text-amber-900/90">
            <li>
              <strong>১.</strong> <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a>-এ ফ্রি project খুলুন
            </li>
            <li>
              <strong>২.</strong> SQL Editor-এ চালান: <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">supabase/schema.sql</code>, তারপর <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">supabase/migrations/*</code> (সবগুলো, ক্রমে)
            </li>
            <li>
              <strong>৩.</strong> লোকালে <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">.env.local</code>-এ ৩টা key দিয়ে <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">npm run seed</code> + <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">npm run grant-admin</code>
            </li>
            <li>
              <strong>৪.</strong> Vercel → Settings → Environment Variables-এ সেই ৩টা key দিন, তারপর Redeploy
            </li>
          </ol>
          {steps.length > 0 && (
            <div className="mt-3 rounded-xl bg-white/70 px-3.5 py-2.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-200">
              <p className="font-bold uppercase tracking-wide text-[10px] mb-1">এখন যা বাকি:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-[11px] text-amber-800/80">
            Key বসামাত্র সাইট নিজে নিজেই live হয়ে যাবে — কোড বদলাতে হবে না। বিস্তারিত:{" "}
            <Link href="/api/health" target="_blank" className="underline font-medium">/api/health</Link> ·{" "}
            <a href="https://github.com/rewaz2050/bhromor/blob/main/docs/go-live.md" target="_blank" rel="noopener noreferrer" className="underline font-medium">docs/go-live.md</a>
          </p>
        </div>
      </div>
    </div>
  );
}
