"use client";

/**
 * Contact channels — real data only.
 *
 * Fetches /api/contact (the shop's ops settings) and renders a channel
 * only when the shop actually configured it. No placeholder numbers, no
 * invented inbox: if nothing is configured, the page says plainly to use
 * the message form.
 */

import { useEffect, useState } from "react";
import { IconMail, IconMapPin, IconPhone } from "@/components/ui/icons";

interface ContactInfo {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}

const pretty = (digits: string): string => `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;

export default function ContactChannels() {
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
  }, []);

  const phone = info?.phone ?? null;
  const whatsapp = info?.whatsapp ?? null;
  const email = info?.email ?? null;

  const channels = [
    phone
      ? {
          key: "call",
          title: "Call us",
          lines: [pretty(phone), "Sat–Thu · 9am–9pm"],
          href: `tel:+88${phone}`,
        }
      : null,
    whatsapp
      ? {
          key: "whatsapp",
          title: "WhatsApp",
          lines: [
            pretty(whatsapp),
            whatsapp === phone ? "Same number" : "Fastest for order support",
          ],
          href: `https://wa.me/88${whatsapp}`,
        }
      : null,
    email
      ? {
          key: "email",
          title: "Email",
          lines: [email, "Replies within a few hours"],
          href: `mailto:${email}`,
        }
      : null,
  ].filter(Boolean) as { key: string; title: string; lines: string[]; href: string }[];

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
              className="group rounded-3xl bg-paper p-6 ring-1 ring-line transition-shadow hover:shadow-lg"
            >
              <h2 className="font-display text-lg font-medium text-forest-900">
                {channel.title}
              </h2>
              {channel.lines.map((line) => (
                <p
                  key={line}
                  className="mt-1.5 text-sm text-ink-soft group-hover:text-forest-700"
                >
                  {line}
                </p>
              ))}
            </a>
          ))}
        </div>
      ) : (
        !failed && (
          <div className="rounded-3xl bg-paper p-6 ring-1 ring-line">
            <h2 className="font-display text-lg font-medium text-forest-900">
              Use the message form
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">
              The shop&rsquo;s phone, WhatsApp and email appear here the
              moment they are set up — messages on the right always reach
              the team.
            </p>
          </div>
        )
      )}

      <div className="flex flex-col justify-between gap-8 rounded-3xl bg-forest-900 p-8 text-ivory-100">
        <div>
          <h2 className="font-display text-2xl font-medium">Where we operate</h2>
          <p className="mt-3 text-sm leading-7 text-ivory-100/70">
            Orders are fulfilled from a local hub and delivered by our own
            riders. We currently serve a limited service area and publish the
            exact zones — we will never silently expand beyond what we can
            deliver on time.
          </p>
          <p className="mt-5 flex items-start gap-3 text-sm text-ivory-100/85">
            <IconMapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
            Fulfilment hub: Sunamganj Sadar, Traffic Point — District:
            Sunamganj, Upazila: Sunamganj Sadar. Real paras: Boropara,
            Shologhar, Notunpara, Mollapara &amp; more.
          </p>
          {phone && (
            <p className="mt-3 flex items-start gap-3 text-sm text-ivory-100/85">
              <IconPhone className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              Support line: {pretty(phone)} (Sat–Thu, 9am–9pm)
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
          Registered brand: PROSANTI · prosanti.store. Privacy and policy
          documents are linked in the footer.
        </p>
      </div>
    </div>
  );
}
