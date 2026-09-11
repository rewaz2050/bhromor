"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCheck, IconShield } from "@/components/ui/icons";

interface HealthResponse {
  mode: "live" | "demo";
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
    return (
      <div className="mb-8 flex items-center gap-2.5 rounded-2xl bg-forest-50 px-4 py-3 ring-1 ring-forest-200">
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
    );
  }

  const steps = health.nextSteps ?? [];
  return (
    <div className="mb-8 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <IconShield className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-amber-900">
            ⚠️ এখন DEMO মোড চলছে — live করতে নিচের ধাপগুলো (মাত্র ~১০ মিনিট)
          </h3>
          <ol className="mt-2.5 space-y-1.5 text-sm leading-6 text-amber-900/90">
            <li>
              <strong>১.</strong> <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a>-এ ফ্রি project খুলুন
            </li>
            <li>
              <strong>২.</strong> SQL Editor-এ চালান: <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">supabase/schema.sql</code>, তারপর <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-mono">supabase/migrations/202609100003_per_user_first10_free.sql</code>
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
            <a href="https://github.com/rewaz2050/bhromor/blob/arena/01a08d0c-bhromor/docs/go-live.md" target="_blank" rel="noopener noreferrer" className="underline font-medium">docs/go-live.md</a>
          </p>
        </div>
      </div>
    </div>
  );
}
