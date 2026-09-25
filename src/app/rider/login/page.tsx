"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { IconTruck } from "@/components/ui/icons";

/**
 * Supabase returns raw English auth errors ("Email not confirmed", "Invalid
 * login credentials"). Riders get the cause plus the next step, in Bangla.
 */
const supabaseSignInError = (err: { message?: string }): string => {
  const m = err.message ?? "";
  if (/email not confirmed/i.test(m)) {
    return "ইমেইলটি এখনো কনফার্ম হয়নি — ইনবক্সে (স্প্যামসহ) পাঠানো কনফার্মেশন লিংকে ক্লিক করুন, তারপর আবার লগইন করুন।";
  }
  if (/invalid login credentials/i.test(m)) {
    return "ইমেইল বা পাসওয়ার্ড মিলছে না। নতুন অ্যাকাউন্ট খুলতে উপরের \u201cনতুন অ্যাকাউন্ট\u201d ট্যাব ব্যবহার করুন।";
  }
  if (/rate limit|too many/i.test(m)) {
    return "অনেকবার চেষ্টা হয়েছে — এক মিনিট পর আবার করুন।";
  }
  return m ? `লগইন করা যায়নি: ${m}` : "লগইন করা যায়নি। সঠিক তথ্য দিয়ে চেষ্টা করুন।";
};

const supabaseSignUpError = (err: { message?: string }): string => {
  const m = err.message ?? "";
  if (/already registered|already exists/i.test(m)) {
    return "এই ইমেইলে অ্যাকাউন্ট আছে — \u201cসাইন ইন (Login)\u201d ট্যাব দিয়ে লগইন করুন। পাসওয়ার্ড ভুলে গেলে অ্যাডমিনকে জানান।";
  }
  if (/rate limit|too many/i.test(m)) {
    return "অনেকবার চেষ্টা হয়েছে — এক মিনিট পর আবার করুন।";
  }
  if (/password/i.test(m) && /weak|short|at least/i.test(m)) {
    return "পাসওয়ার্ড অন্তত ৬ অক্ষরের দিন।";
  }
  return m ? `অ্যাকাউন্ট খোলা যায়নি: ${m}` : "অ্যাকাউন্ট খোলা যায়নি। আবার চেষ্টা করুন।";
};


export default function RiderLoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/rider");
      }
    });
  }, [supabase, router]);

  // The apply success screen sends applicants here to create the login
  // (?mode=up&email=…). Window read (not useSearchParams) so the page needs
  // no Suspense boundary; runs once on mount.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "up") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption of the URL on mount
      setMode("up");
      setNotice(
        "আবেদন পেওয়া গেছে! একই ইমেইল দিয়ে নিচের অ্যাকাউন্ট খুলুন — অনুমোদনের পর এই অ্যাকাউন্টেই রাইডার পোর্টাল খুলবে।",
      );
    }
    const prefill = q.get("email");
    if (prefill) {
      setEmail(prefill.slice(0, 160));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotice(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError("সঠিক ইমেইল অ্যাড্রেস লিখুন।");
      return;
    }
    if (password.length < 6) {
      setFormError("পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }

    if (!supabase) {
      // Never bounce the rider into the guest loop — say what is missing.
      setFormError(
        "সার্ভারে লগইন সিস্টেম এখনো কনফিগার হয়নি (Supabase key নেই)। একটু পরে আবার চেষ্টা করুন।",
      );
      return;
    }

    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          setFormError(supabaseSignInError(error));
          return;
        }
        router.replace("/rider");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (error) {
          setFormError(supabaseSignUpError(error));
          return;
        }
        if (data.session) {
          // Email confirmation is off → the rider is signed in already:
          // take them straight to the application (profile) form.
          router.replace("/rider/apply");
        } else {
          // Email confirmation is on → no session until they tap the link.
          setNotice(
            "অ্যাকাউন্ট তৈরি হয়েছে! এখন ইমেইলে পাঠানো কনফার্মেশন লিংকে ক্লিক করুন (স্প্যাম ফোল্ডারও দেখুন), তারপর এখানে লগইন করে রাইডার আবেদন সম্পূর্ণ করুন।",
          );
        }
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "লগইন করা যায়নি। সঠিক তথ্য দিয়ে চেষ্টা করুন।",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center p-6 sm:p-8">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-gold-300 ring-2 ring-gold-400/30">
          <IconTruck className="h-7 w-7" />
        </span>
        <h1 className="font-display mt-4 text-2xl font-bold text-forest-900 sm:text-3xl">
          PROSANTI রাইডার লগইন
        </h1>
        <p className="mt-1 text-xs text-ink-soft sm:text-sm">
          ডেলিভারি ট্রিপ গ্রহণ, কাস্টমার পিন ভেরিফিকেশন ও ক্যাশ কালেকশন পোর্টাল
        </p>
      </div>

      
        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-3xl border border-line bg-paper p-6 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-ivory-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("in");
                setFormError(null);
              }}
              className={`rounded-lg py-2 transition-all ${
                mode === "in"
                  ? "bg-paper text-forest-900 shadow-sm"
                  : "text-ink-soft hover:text-forest-900"
              }`}
            >
              সাইন ইন (Login)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("up");
                setFormError(null);
              }}
              className={`rounded-lg py-2 transition-all ${
                mode === "up"
                  ? "bg-paper text-forest-900 shadow-sm"
                  : "text-ink-soft hover:text-forest-900"
              }`}
            >
              নতুন অ্যাকাউন্ট
            </button>
          </div>

          {formError && (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}
          {notice && (
            <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900 ring-1 ring-emerald-200">
              {notice}
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-forest-900">
              ইমেইল অ্যাড্রেস
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rider@example.com"
              className="h-12 w-full rounded-2xl border border-line bg-ivory-50 px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest-800"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-forest-900">
              পাসওয়ার্ড
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 w-full rounded-2xl border border-line bg-ivory-50 px-4 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest-800"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-full bg-forest-800 font-semibold text-xs text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
          >
            {busy ? "যাচাই হচ্ছে…" : mode === "in" ? "লগইন করুন" : "অ্যাকাউন্ট খুলুন"}
          </button>
      </form>

      <div className="mt-8 text-center space-y-2 text-xs text-ink-soft">
        <p>
          রাইডার হিসেবে এখনো রেজিস্টার করেননি?{" "}
          <Link href="/rider/apply" className="font-semibold text-forest-800 underline">
            এখানে আবেদন করুন
          </Link>
        </p>
        <p>
          <Link href="/" className="underline text-ink-soft hover:text-forest-900">
            ← স্টোরফ্রন্টে ফিরে যান
          </Link>
        </p>
      </div>
    </div>
  );
}
