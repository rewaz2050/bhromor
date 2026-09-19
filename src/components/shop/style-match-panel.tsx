"use client";

/**
 * /style — the Style Match panel (P2 #19). Ask like a person: occasion,
 * budget, colour, your size (auto-filled from your size-finder profile).
 * Every result prints the reasons it was chosen; nothing is shown as
 * "picked for you" unless a rule actually says why. When the catalog has no
 * answer, the page says so and hands off to the shop — no forced grid of
 * unrelated stock.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useSizeProfile } from "@/lib/use-size-profile";
import { useLanguage } from "@/components/i18n/language-provider";
import { isStyleQueryEmpty, styleMatch, STYLE_OCCASIONS } from "@/lib/style-match";
import ProductCard from "@/components/product/product-card";
import { IconChat, IconRuler } from "@/components/ui/icons";
import { formatBdt } from "@/lib/format";

export default function StyleMatchPanel() {
  const { products } = useLiveCatalog();
  const { profile } = useSizeProfile();
  const { lang } = useLanguage();

  const [occasion, setOccasion] = useState("");
  const [budget, setBudget] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const colors = useMemo(
    () =>
      [...new Set(products.flatMap((p) => p.colors))]
        .map((c) => c.trim())
        .filter((c) => c !== "")
        .sort(),
    [products],
  );

  const query = useMemo(
    () => ({
      occasion: occasion || undefined,
      budgetTaka: budget.trim() === "" ? null : Number(budget),
      colors: color.trim() === "" ? [] : [color.trim()],
      size: size.trim() === "" ? null : size.trim(),
      categoryId: categoryId || null,
    }),
    [occasion, budget, color, size, categoryId],
  );

  const empty = isStyleQueryEmpty(query as never);
  const matches = useMemo(() => styleMatch(products, query), [products, query]);

  const chip =
    "h-9 rounded-full px-3 text-xs font-semibold ring-1 transition-colors";
  const inputCls =
    "h-10 w-full rounded-xl bg-white px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-forest-500";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <header className="text-center">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-600">
          {lang === "bn" ? "স্টাইল ম্যাচ" : "Style Match"}
        </p>
        <h1 className="font-display mx-auto mt-3 max-w-2xl text-4xl font-medium leading-tight tracking-tight text-forest-900 sm:text-5xl">
          {lang === "bn"
            ? "আপনার গায়ের মাপ, বাজেট আর অনুষ্ঠান বলুন — পছন্দ আমরা করছি"
            : "Tell us your size, budget and occasion — we’ll shortlist"}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-ink-soft">
          {lang === "bn"
            ? "প্রতিটা সাজেশনের পাশে লেখা থাকবে কেন বেছে নেওয়া হয়েছে। কোনো ভুতো “AI রেটিং” নয় — আসল ক্যাটালগ, আসল নিয়ম।"
            : "Every pick lists the real reasons behind it — live catalog data, transparent rules, no invented scores."}
        </p>
      </header>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="mx-auto mt-10 grid max-w-3xl gap-4 rounded-3xl bg-white p-6 ring-1 ring-line sm:grid-cols-2"
        aria-label={lang === "bn" ? "স্টাইল প্রশ্ন" : "Style questions"}
      >
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            {lang === "bn" ? "কোন অনুষ্ঠানের জন্য?" : "Which occasion?"}
          </span>
          <select className={inputCls} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            <option value="">{lang === "bn" ? "যেকোনো" : "Any"}</option>
            {STYLE_OCCASIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {lang === "bn" ? o.labelBn : o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            {lang === "bn" ? "বাজেট (৳, সর্বোচ্চ)" : "Budget (৳, at most)"}
          </span>
          <input
            className={inputCls}
            type="number"
            min="0"
            step="50"
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 1500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            {lang === "bn" ? "পছন্দের রঙ" : "Preferred colour"}
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {colors.slice(0, 10).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color === c}
                onClick={() => setColor(color === c ? "" : c)}
                className={`${chip} ${
                  color === c ? "bg-forest-800 text-white ring-forest-700" : "bg-white text-ink ring-line hover:ring-forest-300"
                }`}
              >
                {c}
              </button>
            ))}
            {colors.length === 0 ? (
              <span className="text-xs text-ink-soft">—</span>
            ) : null}
          </div>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {lang === "bn" ? "সাইজ" : "Size"}
            </span>
            <input
              className={inputCls}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="L"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {lang === "bn" ? "ক্যাটাগরি" : "Category"}
            </span>
            <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{lang === "bn" ? "সব" : "All"}</option>
              {[...new Set(products.map((p) => p.category))].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!profile ? (
          <p className="text-xs text-ink-soft sm:col-span-2">
            {lang === "bn" ? "সাইজ নিশ্চিত করতে আগে একবার " : "For a confident size, run the "}
            <Link href="/shop" className="font-semibold text-forest-800 underline underline-offset-2">
              {lang === "bn" ? "সাইজ ফাইন্ডার" : "Size Finder"}
            </Link>
            {lang === "bn" ? " চালিয়ে নিন — উত্তর আপনার এই ডিভাইসেই থাকে।" : " once — your answers stay on this device."}
          </p>
        ) : null}
      </form>

      {empty ? (
        <p className="mx-auto mt-10 max-w-xl text-center text-sm leading-7 text-ink-soft">
          {lang === "bn"
            ? "উপরের অন্তত একটা প্রশ্নের উত্তর দিন — তখনই আমরা আসল ক্যাটালগ থেকে বাছছি।"
            : "Answer at least one question and the whole live catalog goes to work."}
        </p>
      ) : matches.length === 0 ? (
        <div className="mx-auto mt-10 max-w-xl rounded-2xl bg-ivory-100 p-6 text-center ring-1 ring-line">
          <p className="font-display text-xl text-forest-900">
            {lang === "bn" ? "এই শর্তে মিল পাওয়া যায়নি" : "Nothing matches that exact ask"}
          </p>
          <p className="mt-2 text-sm leading-7 text-ink-soft">
            {lang === "bn"
              ? "বাজেট একটু বাড়ান বা রঙ সরিয়ে দিন — অথবা দোকানকে WhatsApp-ে লিখুন, আসল মানুষই উত্তর দেবে।"
              : "Loosen the budget or drop the colour — or message the shop on WhatsApp; a real person answers."}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/shop" className={`inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-white`}>
              <IconRuler className="h-3.5 w-3.5" /> {lang === "bn" ? "পুরো শপ" : "Browse the shop"}
            </Link>
            <Link href="/contact" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-forest-800 ring-1 ring-line">
              <IconChat className="h-3.5 w-3.5" /> {lang === "bn" ? "যোগাযোগ" : "Ask the shop"}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-12">
          <p className="text-sm text-ink-soft">
            {lang === "bn"
              ? `${matches.length}টি পিস আপনার শর্ত মেনেছে —`
              : `${matches.length} piece${matches.length === 1 ? "" : "s"} honour every constraint —`}
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => (
              <div key={m.product.id} className="space-y-2">
                <ProductCard product={m.product} />
                <ul className="flex flex-wrap gap-1.5">
                  {m.reasons.map((r) => (
                    <li
                      key={r}
                      className="rounded-full bg-forest-50 px-2.5 py-1 text-[0.65rem] font-semibold text-forest-800"
                    >
                      {r}
                    </li>
                  ))}
                  <li className="rounded-full px-2.5 py-1 text-[0.65rem] text-ink-soft">
                    {formatBdt(m.product.price)}
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
