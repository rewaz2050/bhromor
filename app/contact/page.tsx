import type { Metadata } from 'next';
import Reveal from '@/components/Reveal';
import EnquiryForm from '@/components/EnquiryForm';
import { faq, site } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Contact & directions',
  description:
    'Enquire about dates at PROSANTI, Sylhet. Fifty-five minutes from Osmani International, with transfers included.',
};

export default function ContactPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <>
      <section className="mx-auto max-w-8xl px-6 pb-20 pt-44 sm:px-10 sm:pt-52">
        <Reveal>
          <p className="eyebrow">Contact</p>
          <h1 className="display-xl mt-8 max-w-4xl font-light">
            Tell us when
            <br />
            <span className="italic text-moss-600">you might come.</span>
          </h1>
          <p className="lede mt-10 max-w-2xl">
            There is no booking engine and no availability calendar, because
            with nine rooms it is quicker to simply talk. Send the form below or
            write to us directly.
          </p>
        </Reveal>
      </section>

      {/* Form + details */}
      <section className="mx-auto max-w-8xl px-6 pb-24 sm:px-10 sm:pb-32">
        <div className="grid gap-16 lg:grid-cols-[1.3fr_0.7fr] lg:gap-24">
          <Reveal>
            <EnquiryForm />
          </Reveal>

          <Reveal delay={120}>
            <aside className="space-y-12 lg:sticky lg:top-32 lg:self-start">
              <div>
                <h2 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                  Direct
                </h2>
                <div className="mt-5 flex flex-col gap-2.5">
                  <a
                    href={`mailto:${site.email}`}
                    className="link-underline w-fit font-display text-[1.375rem] font-light text-ink"
                  >
                    {site.email}
                  </a>
                  <a
                    href={`tel:${site.phone.replace(/\s/g, '')}`}
                    className="link-underline w-fit font-sans text-sm font-light text-ink-soft"
                  >
                    {site.phone}
                  </a>
                  <span className="font-sans text-xs uppercase tracking-[0.18em] text-ink/40">
                    Calls &amp; WhatsApp, 08:00–20:00 BST
                  </span>
                </div>
              </div>

              <div>
                <h2 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                  Getting here
                </h2>
                <p className="mt-5 font-sans text-sm font-light leading-[1.85] text-ink-soft">
                  {site.location}
                  <br />
                  <span className="text-ink/45">{site.coordinates}</span>
                </p>
                <ul className="mt-5 space-y-3 font-sans text-sm font-light leading-relaxed text-ink-soft">
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-moss-500" />
                    By air — 55 minutes from Osmani International (ZYL). We
                    collect you.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-moss-500" />
                    By rail — overnight train from Dhaka arrives Sylhet 07:40.
                    We meet it.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-moss-500" />
                    By road — roughly five hours from Dhaka. Parking on site.
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-moss-600">
                  Good to know
                </h2>
                <p className="mt-5 font-sans text-sm font-light leading-[1.85] text-ink-soft">
                  Nine rooms. No televisions. Wifi in the reading room only.
                  Children welcome on two of the four retreats.
                </p>
              </div>
            </aside>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-ink/10 bg-ivory-deep">
        <div className="mx-auto max-w-8xl px-6 py-24 sm:px-10 sm:py-32">
          <Reveal>
            <p className="eyebrow">Questions we get asked</p>
            <h2 className="display-lg mt-8 max-w-2xl font-light">
              Practical things.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-x-16 gap-y-12 md:grid-cols-2">
            {faq.map((item, i) => (
              <Reveal key={item.q} delay={(i % 2) * 90}>
                <div className="border-t border-ink/10 pt-7">
                  <h3 className="font-sans text-[0.9375rem] font-medium text-ink">
                    {item.q}
                  </h3>
                  <p className="body-copy mt-3.5">{item.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
