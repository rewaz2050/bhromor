'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { site } from '@/lib/content';
import Icon from './Icon';

const links = [
  { href: '/about', label: 'The house' },
  { href: '/retreats', label: 'Retreats' },
  { href: '/journal', label: 'Journal' },
  { href: '/contact', label: 'Contact' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const isHome = pathname === '/';
  /** Over the hero we want light text; everywhere else, dark. */
  const transparent = isHome && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-700 ease-calm ${
          transparent
            ? 'bg-transparent py-6 text-ivory-pale'
            : 'border-b border-ink/10 bg-ivory/85 py-4 text-ink backdrop-blur-xl'
        }`}
      >
        <div className="mx-auto flex max-w-8xl items-center justify-between gap-6 px-6 sm:px-10">
          <Link
            href="/"
            className="group flex flex-col leading-none"
            aria-label="PROSANTI — home"
          >
            <span className="font-display text-[1.375rem] font-medium tracking-[0.2em]">
              PROSANTI
            </span>
            <span className="mt-1 font-bengali text-[0.6875rem] tracking-[0.3em] opacity-60">
              {site.bnName}
            </span>
          </Link>

          <nav className="hidden items-center gap-10 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`link-underline font-sans text-[0.75rem] font-medium uppercase tracking-[0.18em] transition-opacity ${
                  pathname === link.href ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              className={`group inline-flex items-center gap-2 rounded-full border px-6 py-2.5 font-sans text-[0.6875rem] font-medium uppercase tracking-[0.18em] transition-all duration-500 ease-calm ${
                transparent
                  ? 'border-ivory-pale/40 hover:bg-ivory-pale hover:text-moss-900'
                  : 'border-moss-800/30 hover:bg-moss-800 hover:text-ivory-pale'
              }`}
            >
              Reserve
              <Icon
                name="arrow"
                className="h-3.5 w-3.5 transition-transform duration-500 ease-calm group-hover:translate-x-1"
                strokeWidth={1.5}
              />
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center md:hidden"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <Icon name={open ? 'close' : 'menu'} className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-moss-900 text-ivory-pale transition-all duration-500 ease-calm md:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <nav className="flex h-full flex-col justify-center gap-2 px-8">
          {links.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className="border-b border-ivory/10 py-5 font-display text-[2.25rem] font-light leading-none tracking-tight"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-10 space-y-1 font-sans text-sm text-ivory-deep/70">
            <p>{site.location}</p>
            <a href={`mailto:${site.email}`} className="link-underline">
              {site.email}
            </a>
          </div>
        </nav>
      </div>
    </>
  );
}
