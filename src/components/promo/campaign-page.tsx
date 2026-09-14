"use client";

/**
 * The campaign landing itself (P2 #20) — /campaign.
 *
 * One rule holds the page together: every visible claim comes from the armed
 * settings document. Before the window opens the countdown counts UP to the
 * opening and the early-access list is the action; inside the window it
 * counts DOWN to close and the picks are "add to bag" ready; after it ends
 * the page says it ended — the URL stays alive because Eid cards and
 * WhatsApp links outlive the hour they were shared for.
 *
 * Early access is honest like every other "we'll tell you" in this stack:
 * there is no mailer wired, so the list is a real newsletter row (exportable
 * from Admin → Newsletter) and the shop contacts the list before opening.
 */

import { useState } from "react";
import Link from "next/link";
import { useCampaign } from "@/lib/use-promos";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { useLanguage } from "@/components/i18n/language-provider";
import { campaignMatchesProduct } from "@/lib/campaign";
import { FlashCountup, FlashTimer } from "./flash-timer";
import ProductCard from "@/components/product/product-card";
import { IconBolt } from "@/components/ui/icons";
import { Eyebrow } from "@/components/ui/primitives";

function EarlyAccessBox() {
  const { lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const join = async () => {
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), campaign: "campaign" }),
      });
      if (res.ok) {
        setState("done");
        setEmail("");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-line">
      <h2 className="font-display text-xl text-forest-900">
        {lang === "bn" ? "আগে জানুন — Early access" : "Early access list"}
      </h2>
      <p className="mt-2 text-sm leading-7 text-ink-soft">
        {lang === "bn"
          ? "ইমেইল দিন — ক্যাম্পেইন শুরুর আগে দোকান থেকে তালিকায় যোগাযোগ করা হবে।"
          : "Leave your email — the shop reaches out to this list before the drop opens. It joins the same newsletter table the shop already runs."}
      </p>
      {state === "done" ? (
        <p className="mt-4 text-sm font-medium text-forest-800" role="status">
          {lang === "bn"
            ? "তালিকায় যুক্ত হয়েছেন — ধন্যবাদ!"
            : "You're on the list — thank you!"}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label={lang === "bn" ? "ইমেইল" : "Email"}
            className="h-11 min-w-0 flex-1 rounded-xl bg-ivory-100 px-4 text-sm outline-none ring-1 ring-line focus:ring-forest-500"
          />
          <button
            type="button"
            onClick={() => void join()}
            disabled={state === "sending" || email.trim().length < 5}
            className="h-11 rounded-xl bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {state === "sending"
              ? lang === "bn"
                ? "যোগ হচ্ছে…"
                : "Joining…"
              : lang === "bn"
                ? "যোগ দিন"
                : "Join the list"}
          </button>
        </div>
      )}
      {state === "error" ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {lang === "bn"
            ? "যোগ করা যায়নি — সঠিক ইমেইল দিয়ে আবার চেষ্টা করুন।"
            : "Could not join — check the email and try again."}
        </p>
      ) : null}
    </div>
  );
}

export default function CampaignPage() {
  const { campaign, ready } = useCampaign();
  const { products } = useLiveCatalog();
  const { lang } = useLanguage();

  const title = (lang === "bn" && campaign.titleBn) || campaign.title || "";
  const subtitle = (lang === "bn" && campaign.subtitleBn) || campaign.subtitle || "";
  const expressNote = (lang === "bn" && campaign.expressNoteBn) || campaign.expressNote || "";

  // The shop's picks (ids or slugs) in the order the owner chose them;
  // with no picks, the storefront's own featured rail stands in — real,
  // discoverable products, never an invented "campaign collection".
  const picks =
    campaign.productIds.length > 0
      ? campaign.productIds
          .map((id) => products.find((p) => campaignMatchesProduct({ ...campaign, productIds: [id] }, p)))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
      : products.filter((p) => p.featured && p.inStock).slice(0, 8);

  const quiet = (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <Eyebrow>{lang === "bn" ? "ক্যাম্পেইন" : "Campaign"}</Eyebrow>
      <h1 className="font-display mt-3 text-4xl text-forest-900">
        {title || (lang === "bn" ? "এখন কোনো ক্যাম্পেইন চলছে না" : "No campaign is running right now")}
      </h1>
      <p className="mt-4 text-sm leading-7 text-ink-soft">
        {campaign.state === "ended"
          ? lang === "bn"
            ? "এই ক্যাম্পেইন শেষ হয়ে গেছে — আসল দামেই সব পিস এখনও দোকানে আছে।"
            : "This campaign has ended — every piece is still in the shop at its real price."
          : lang === "bn"
            ? "দোকান মালিক যখন নতুন উৎসবের ড্রপ সাজান, এই পেজটা ঠিক তখনই খুলে যাবে। ততক্ষণ শপ দেখুন।"
            : "The shop owner arms this page for each festive drop. Until then — the whole catalog is one tap away."}
      </p>
      <Link
        href="/shop"
        className="mt-8 inline-flex h-12 items-center rounded-full bg-forest-800 px-7 text-sm font-semibold text-white"
      >
        {lang === "bn" ? "শপ দেখুন" : "Browse the shop"}
      </Link>
    </section>
  );

  if (!ready) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6" aria-busy="true">
        <p className="text-sm text-ink-soft">{lang === "bn" ? "লোড হচ্ছে…" : "Loading…"}</p>
      </section>
    );
  }

  if (campaign.state === "off" || campaign.state === "ended") return quiet;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
      <header className="rounded-3xl bg-forest-900 px-6 py-14 text-center text-ivory-100 sm:px-10 lg:py-20">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.38em] text-gold-300">
          {campaign.state === "live"
            ? lang === "bn"
              ? "চলছে এখন"
              : "Live now"
            : lang === "bn"
              ? "শীঘ্রই আসছে"
              : "Coming soon"}
        </p>
        <h1 className="font-display mx-auto mt-3 max-w-2xl text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          {title || (lang === "bn" ? "সিজনাল ড্রপ" : "Seasonal drop")}
        </h1>
        {subtitle ? (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-ivory-100/75 sm:text-base">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-gold-200 tabular-nums">
          {campaign.state === "live" && campaign.endsAtMs ? (
            <>
              {lang === "bn" ? "শেষ হতে" : "Ends in"} <FlashTimer endsAtMs={campaign.endsAtMs} className="text-gold-200" />
            </>
          ) : campaign.startsAtMs ? (
            <>
              {lang === "bn" ? "শুরু হতে" : "Opens in"} <FlashCountup atMs={campaign.startsAtMs} />
            </>
          ) : null}
        </p>
        <div>
          <Link
            href="/shop"
            className="mt-8 inline-flex h-12 items-center rounded-full bg-gold-300 px-7 text-sm font-semibold text-forest-950"
          >
            {campaign.state === "live"
              ? lang === "bn"
                ? "এখনই কিনুন"
                : "Shop the drop"
              : lang === "bn"
                ? "আগে দেখুন"
                : "Look around now"}
          </Link>
        </div>
      </header>

      {expressNote ? (
        <p className="mx-auto mt-6 flex max-w-3xl items-center justify-center gap-2 rounded-2xl bg-gold-300/10 px-5 py-3 text-center text-sm font-medium text-forest-900 ring-1 ring-gold-300/40">
          <IconBolt className="h-4 w-4 shrink-0 text-gold-600" />
          {expressNote}
        </p>
      ) : null}

      <div className="mt-12 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-display text-2xl text-forest-900">
            {campaign.state === "live"
              ? lang === "bn"
                ? "ড্রপের পিসসমূহ"
                : "The pieces on the drop"
              : lang === "bn"
                ? "প্রথম ঝলক"
                : "First look"}
          </h2>
          {picks.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3">
              {picks.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">
              {lang === "bn"
                ? "এখনও কোনো পিস ঠিক করা হয়নি — শপ থেকে দেখুন।"
                : "The shop hasn't pinned pieces yet — browse the shop meanwhile."}
            </p>
          )}
        </div>
        <aside className="space-y-6">
          {campaign.earlyAccess ? <EarlyAccessBox /> : null}
          <div className="rounded-2xl bg-ivory-100 p-6 text-sm leading-7 text-ink-soft ring-1 ring-line">
            {campaign.state === "live"
              ? lang === "bn"
                ? "ড্রপ চলাকালীন অর্ডার সাধারণ নিয়মেই প্রসেস হয় — COD, ৭ দিনের এক্সচেঞ্জ আর রিয়েল ট্র্যাকিং সব থাকছে।"
                : "Orders during the drop run on the normal rails — COD, 7-day exchange, live tracking, all of it."
              : lang === "bn"
                ? "তালিকায় থাকা মানে সারিতে দাঁড়ানো না — দোকান খোলার আগেই আপনাকে জানিয়ে দেবে।"
                : "Being on the list means no queue: the shop contacts this list before the doors open."}
          </div>
        </aside>
      </div>
    </div>
  );
}
