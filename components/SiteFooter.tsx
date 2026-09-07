import Link from 'next/link';
import { site, retreats, posts } from '@/lib/content';

const columns = [
  {
    title: 'Visit',
    links: retreats.slice(0, 4).map((r) => ({
      label: r.name,
      href: `/retreats/${r.slug}`,
    })),
  },
  {
    title: 'Read',
    links: posts.map((p) => ({ label: p.title, href: `/journal/${p.slug}` })),
  },
  {
    title: 'The estate',
    links: [
      { label: 'The house', href: '/about' },
      { label: 'All retreats', href: '/retreats' },
      { label: 'Journal', href: '/journal' },
      { label: 'Contact & directions', href: '/contact' },
    ],
  },
];

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="grain relative overflow-hidden bg-moss-950 text-ivory-deep">
      {/* Closing call to action */}
      <div className="mx-auto max-w-8xl px-6 pb-16 pt-28 sm:px-10 sm:pt-36">
        <div className="grid gap-12 border-b border-ivory/10 pb-20 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow !text-brass-300 [&::before]:!bg-brass-400">
              Come and stay
            </p>
            <h2 className="display-lg mt-8 max-w-2xl font-light text-ivory-pale">
              The valley is not going anywhere. Neither, mostly, are we.
            </h2>
          </div>
          <div className="lg:justify-self-end">
            <Link
              href="/contact"
              className="btn-primary !bg-ivory-pale !text-moss-950 hover:!bg-brass-200"
            >
              Enquire about dates
            </Link>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid gap-12 py-20 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-[1.5rem] font-medium tracking-[0.2em] text-ivory-pale">
                PROSANTI
              </span>
              <span className="mt-1.5 font-bengali text-[0.75rem] tracking-[0.3em] text-brass-300">
                {site.bnName}
              </span>
            </div>
            <p className="mt-6 max-w-xs font-sans text-sm font-light leading-relaxed text-ivory-deep/60">
              {site.description}
            </p>
            <p className="mt-6 font-sans text-xs uppercase tracking-[0.2em] text-ivory-deep/40">
              {site.established}
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-brass-300">
                {col.title}
              </h3>
              <ul className="mt-6 space-y-3.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="link-underline font-sans text-sm font-light text-ivory-deep/70 transition-colors hover:text-ivory-pale"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact strip */}
        <div className="grid gap-8 border-t border-ivory/10 pt-12 md:grid-cols-3">
          <div>
            <h3 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-brass-300">
              Find us
            </h3>
            <p className="mt-4 font-sans text-sm font-light leading-relaxed text-ivory-deep/70">
              {site.location}
              <br />
              <span className="text-ivory-deep/45">{site.coordinates}</span>
            </p>
          </div>
          <div>
            <h3 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-brass-300">
              Reach us
            </h3>
            <div className="mt-4 flex flex-col gap-2 font-sans text-sm font-light">
              <a
                href={`mailto:${site.email}`}
                className="link-underline w-fit text-ivory-deep/70 hover:text-ivory-pale"
              >
                {site.email}
              </a>
              <a
                href={`tel:${site.phone.replace(/\s/g, '')}`}
                className="link-underline w-fit text-ivory-deep/70 hover:text-ivory-pale"
              >
                {site.phone}
              </a>
            </div>
          </div>
          <div>
            <h3 className="font-sans text-[0.6875rem] font-medium uppercase tracking-widest2 text-brass-300">
              Good to know
            </h3>
            <p className="mt-4 font-sans text-sm font-light leading-relaxed text-ivory-deep/70">
              Nine rooms. No televisions. Wifi in the reading room only, and it is
              not fast.
            </p>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-ivory/10 pt-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="font-sans text-xs font-light text-ivory-deep/40">
            © {year} PROSANTI. Kamalpur Tea Estate, Sylhet, Bangladesh.
          </p>
          <p className="font-bengali text-xs text-ivory-deep/40">
            {site.tagline} · {site.bnName}
          </p>
        </div>
      </div>
    </footer>
  );
}
