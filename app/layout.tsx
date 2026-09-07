import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { site } from '@/lib/content';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import './globals.css';

/**
 * Fonts are self-hosted rather than pulled from Google Fonts.
 * They are vendored into /fonts from the @fontsource packages listed in
 * devDependencies, which keeps the build offline-safe and removes a
 * third-party request from every page view.
 */
const display = localFont({
  src: [
    { path: '../fonts/fraunces-latin-full-normal.woff2', style: 'normal' },
    { path: '../fonts/fraunces-latin-full-italic.woff2', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

const sans = localFont({
  src: [
    { path: '../fonts/inter-latin-wght-normal.woff2', style: 'normal' },
    { path: '../fonts/inter-latin-wght-italic.woff2', style: 'italic' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

const bengali = localFont({
  src: [
    {
      path: '../fonts/tiro-bangla-bengali-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-bengali',
  display: 'swap',
  fallback: ['Noto Serif Bengali', 'serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://prosanti.com.bd'),
  title: {
    default: `PROSANTI — ${site.tagline}`,
    template: '%s · PROSANTI',
  },
  description: site.description,
  keywords: [
    'PROSANTI',
    'প্রশান্তি',
    'retreat Bangladesh',
    'Sylhet retreat',
    'wellness sanctuary',
    'tea garden stay',
    'silent retreat',
  ],
  authors: [{ name: 'PROSANTI' }],
  openGraph: {
    title: `PROSANTI — ${site.tagline}`,
    description: site.description,
    type: 'website',
    locale: 'en_BD',
    siteName: 'PROSANTI',
    images: [{ url: '/images/hero-valley.jpg', width: 1600, height: 900 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `PROSANTI — ${site.tagline}`,
    description: site.description,
  },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#273a2a',
  width: 'device-width',
  initialScale: 1,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LodgingBusiness',
  name: site.name,
  description: site.description,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Kamalpur Tea Estate',
    addressLocality: 'Sylhet',
    addressCountry: 'BD',
  },
  email: site.email,
  telephone: site.phone,
  foundingDate: String(site.founded),
  numberOfRooms: 9,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${bengali.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
