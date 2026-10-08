"use client";

/**
 * Contact channels — real data only.
 *
 * The page reads them on the server and passes them down, so the channels
 * are in the first paint (flicker pass 2026-10-07): this used to render the
 * "use the message form" panel and then swap in one to three cards when
 * /api/contact answered, moving everything below it. Without a server value
 * (a cached shell, or the page rendered before the shop configured any) it
 * still asks — and renders a channel only when the shop actually configured
 * it. No placeholder numbers, no invented inbox.
 */

import { useEffect, useState, type ReactNode } from "react";
import { IconMail, IconMapPin, IconPhone } from "@/components/ui/icons";
import L from "@/components/i18n/l";
import type { ContactInfo } from "@/lib/contact";

const pretty = (digits: string): string => `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;

export default function ContactChannels({
  initial = null,
}: {
  /** What the server already read; when present, no request is made. */
  initial?: ContactInfo | null;
}) {
  const [info, setInfo] = useState<ContactInfo | null>(initial);
  const [failed, setFailed] = useState(false);

  // The page handed us the answer — asking again would only risk showing a
  // stale second copy of it.
  const settled = initial !== null;
  useEffect(() => {
    if (settled) return;
    let cancelled = false;
    fetch("/api/contact", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ContactInfo | null) => {
        if (!cancelled) {
          if (d) setInfo(d);
          else setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [settled]);

  const phone = info?.phone ?? null;
  const whatsapp = info?.whatsapp ?? null;
  const email = info?.email ?? null;

  // UX plan §11 (R8) — WhatsApp first (it is how Sunamganj actually talks
  // to a shop), then the call, then e-mail; the form sits beside them.
  const channels = [
    whatsapp
      ? {
          key: "whatsapp",
          title: "WhatsApp",
          lines: [
            pretty(whatsapp),
            whatsapp === phone ? (
              <L en="Same number · fastest reply" bn="একই নম্বর · দ্রুততম উত্তর" />
            ) : (
              <L en="Fastest for order support" bn="অর্ডার নিয়ে সবচেয়ে দ্রুত জবাব" />
            ),
          ],
          href: `https://wa.me/88${whatsapp}`,
        }
      : null,
    phone
      ? {
          key: "call",
          title: <L en="Call us" bn="ফোন করুন" />,
          lines: [
            pretty(phone),
            <L key="hours" en="Sat–Thu · 9am–9pm" bn="শনি–বৃহঃ · সকাল ৯টা–রাত ৯টা" />,
          ],
          href: `tel:+88${phone}`,
        }
      : null,
    email
      ? {
          key: "email",
          title: <L en="Email" bn="ইমেইল" />,
          lines: [
            email,
            <L key="sla" en="Replies within a few hours" bn="কয়েক ঘণ্টার মধ্যে জবাব" />,
          ],
          href: `mailto:${email}`,
        }
      : null,
  ].filter(Boolean) as {
    key: string;
    title: ReactNode;
    lines: ReactNode[];
    href: string;
  }[];

  return (
    <div className="flex flex-col gap-8">
      {channels.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <a
              key={channel.key}
              href={channel.href}
              target={channel.href.startsWith("http") ? "_blank" : undefined}
              rel={channel.href.startsWith("http") ? "noreferrer" : undefined}
              data-testid={`contact-${channel.key}`}
              className={`group rounded-3xl p-6 ring-1 transition-shadow hover:shadow-lg ${
                channel.key === "whatsapp"
                  ? "bg-forest-50 ring-forest-200"
                  : "bg-paper ring-line"
              }`}
            >
              <h2 className="font-display text-lg font-medium text-forest-900">
                {channel.title}
              </h2>
              {channel.lines.map((line, i) => (
                <p
                  key={i}
                  className="mt-1.5 text-sm text-ink-soft group-hover:text-forest-700"
                >
                  {line}
                </p>
              ))}
            </a>
          ))}
        </div>
      ) : (
        !failed &&
        !settled && (
          <div className="rounded-3xl bg-paper p-6 ring-1 ring-line">
            <h2 className="font-display text-lg font-medium text-forest-900">
              <L
                en="Use the message form"
                bn="মেসেজ ফর্ম ব্যবহার করুন"
              />
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">
              <L
                en="The shop’s phone, WhatsApp and email appear here the moment they are set up — messages on the right always reach the team."
                bn="দোকানের ফোন, WhatsApp ও ইমেইল সেটআপ হওয়ার সাথে সাথেই এখানে দেখা যাবে — ডান পাশের বার্তা সবসময় আমাদের টিমের কাছে পৌঁছায়।"
              />
            </p>
          </div>
        )
      )}

      <div className="flex flex-col justify-between gap-8 rounded-3xl bg-forest-900 p-8 text-ivory-100">
        <div>
          <h2 className="font-display text-2xl font-medium">
            <L en="Where we operate" bn="আমরা কোথায় কাজ করি" />
          </h2>
          <p className="mt-3 text-sm leading-7 text-ivory-100/70">
            <L
              en="Orders are fulfilled from a local hub and delivered by our own riders. We currently serve a limited service area and publish the exact zones — we will never silently expand beyond what we can deliver on time."
              bn="অর্ডার স্থানীয় হাব থেকে প্রস্তুত করা হয় এবং আমাদের নিজেদের রাইডার ডেলিভারি দেয়। বর্তমানে আমরা একটি সীমিত এলাকায় কাজ করি এবং নির্দিষ্ট জোনগুলো প্রকাশ করি — সময়মতো ডেলিভারি দিতে পারব না, এমন এলাকায় চুপচাপ বিস্তার করব না।"
            />
          </p>
          <p className="mt-5 flex items-start gap-3 text-sm text-ivory-100/85">
            <IconMapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
            <L
              en="Fulfilment hub: Sunamganj Sadar, Traffic Point — District: Sunamganj, Upazila: Sunamganj Sadar. Real paras: Boropara, Shologhar, Notunpara, Mollapara & more."
              bn="ফুলফিলমেন্ট হাব: সুনামগঞ্জ সদর, ট্রাফিক পয়েন্ট — জেলা: সুনামগঞ্জ, উপজেলা: সুনামগঞ্জ সদর। এলাকা: বড়পাড়া, শালঘর, নতুনপাড়া, মোল্লাপাড়া ও আরও অনেক।"
            />
          </p>
          {phone && (
            <p className="mt-3 flex items-start gap-3 text-sm text-ivory-100/85">
              <IconPhone className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              <L
                en={`Support line: ${pretty(phone)} (Sat–Thu, 9am–9pm)`}
                bn={`সাপোর্ট লাইন: ${pretty(phone)} (শনি–বৃহঃ, সকাল ৯টা–রাত ৯টা)`}
              />
            </p>
          )}
          {email && (
            <p className="mt-3 flex items-start gap-3 text-sm text-ivory-100/85">
              <IconMail className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              {email}
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-ivory-100/50">
          <L
            en="Registered brand: PROSANTI · prosanti.store. Privacy and policy documents are linked in the footer."
            bn="নিবন্ধিত ব্র্যান্ড: PROSANTI · prosanti.store। গোপনীয়তা ও নীতিমালা ফুটারে পাবেন।"
          />
        </p>
      </div>
    </div>
  );
}
