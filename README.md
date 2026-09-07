# PROSANTI — প্রশান্তি

> Where the mind comes to rest.

A complete marketing website for **PROSANTI**, a nine-room retreat and wellness
sanctuary on a working tea estate in the Khasi hills of Sylhet, Bangladesh.

Built with **Next.js 16** (App Router) · **TypeScript** · **Tailwind CSS 3**.
Every page is statically prerendered — there is no database and no backend.

---

## Status

| | |
|---|---|
| Pages | 5 templates, 16 prerendered routes |
| Build | `next build` passes, 0 TypeScript errors |
| Audit | `npm audit` → 0 vulnerabilities |
| Assets | `npm run check:assets` passes |

> **Note on the source brief.** Work started from a `PROSANTI_Website_Master_Blueprint.md`
> attachment that did not arrive in the build environment. The content, brand
> positioning and page structure below are an interpretation built from the
> project name (প্রশান্তি — *prosanti*, "the quiet that settles after rain")
> rather than the blueprint. All copy lives in a single file
> ([`lib/content.ts`](lib/content.ts)) so it can be replaced wholesale when the
> real blueprint is available.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

---

## What's here

### Pages

| Route | What it is |
|---|---|
| `/` | Hero, philosophy, six experiences, retreats, spring bath, testimonials, journal |
| `/about` | The house — story, values, ten-year timeline |
| `/retreats` | All four stays with pricing and inclusions |
| `/retreats/[slug]` | Individual retreat, with a sticky booking panel |
| `/journal` | Journal index with a lead entry |
| `/journal/[slug]` | Full article, with `Article` structured data |
| `/contact` | Enquiry form, directions, FAQ with `FAQPage` structured data |
| `not-found` | Branded 404 |
| `/sitemap.xml`, `/robots.txt` | Generated from `lib/content.ts` |

### The four retreats

1. **The Still Week** — 7 nights, ৳78,000 pp
2. **Monsoon Days** — 4 nights, ৳42,000 pp
3. **Two, for the Quiet** — 3 nights, ৳55,000 pp
4. **The Long Weekend** — 3 nights, ৳31,000 pp

---

## Editing content

**Everything is in [`lib/content.ts`](lib/content.ts).** Retreats, journal posts,
testimonials, FAQs, contact details, pricing, navigation labels — change it
there and every page, the sitemap and the structured data all follow.

Adding a retreat is one object in the `retreats` array; the detail page, the
listing, the footer links and the sitemap entry all appear automatically via
`generateStaticParams`.

---

## Design system

Palette is defined in [`tailwind.config.ts`](tailwind.config.ts):

| Token | Use |
|---|---|
| `moss-*` | Evergreen — primary brand, dark sections |
| `ivory-*` | Warm paper backgrounds |
| `clay-*` | Warm accent |
| `brass-*` | Metallic accent on dark surfaces |
| `ink-*` | Text |

Typography pairs **Fraunces** (display serif) with **Inter** (body) and
**Tiro Bangla** (Bengali). Reusable primitives live in
[`app/globals.css`](app/globals.css) — `.display-xl/lg/md`, `.eyebrow`,
`.lede`, `.btn-primary`, `.btn-ghost`, `.grain`.

Scroll reveals use the [`<Reveal>`](components/Reveal.tsx) component, which
degrades to immediately-visible content when `IntersectionObserver` is
unavailable, and the whole site respects `prefers-reduced-motion`.

### Fonts are self-hosted, deliberately

`next/font/google` was replaced with `next/font/local`. The sandbox cannot reach
`fonts.googleapis.com` (TLS is blocked), and a production site is better off
without a third-party font request on every page view anyway.

The woff2 files in [`fonts/`](fonts/) (484 KB total) are vendored from the
`@fontsource` packages pinned in `devDependencies`. To refresh them:

```bash
npm install --save-dev @fontsource-variable/fraunces \
  @fontsource-variable/inter @fontsource/tiro-bangla
cp node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-*.woff2 fonts/
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-*.woff2 fonts/
cp node_modules/@fontsource/tiro-bangla/files/tiro-bangla-bengali-400-normal.woff2 fonts/
```

---

## Verification

```bash
npm run verify     # assets + typecheck + build
```

Individually:

```bash
npm run check:assets   # every /images/* reference exists in public/
npm run typecheck      # tsc --noEmit
npm run build          # production build, prerenders all routes
npm audit              # dependency vulnerabilities
```

`check:assets` exists because a missing image does **not** fail a Next.js build —
it fails silently in the browser as a 404, or as a 400 from `next/image`'s
optimizer. The script scans `lib/`, `app/` and `components/` for image
references, confirms each exists in `public/`, reports which source file made
each broken reference, and exits non-zero. It also warns about images shipped
but never used.

---

## Known gaps

- **One journal image is a stand-in.** `Building with what the valley gave us`
  reuses `pavilion.jpg` because the image-generation budget was exhausted before
  a bespoke shot could be made. It is marked `TODO` in `lib/content.ts`.
- **The enquiry form has no backend.** [`EnquiryForm`](components/EnquiryForm.tsx)
  validates, then hands off to the visitor's own mail client with everything
  pre-filled. Point `handleSubmit` at a form endpoint to make it real.
- **Contact details, pricing and dates are placeholder content** invented to
  make the site coherent. Replace before going live.
- **`metadataBase` is `prosanti.com.bd`** — update to the real domain.

---

## Structure

```
app/
  layout.tsx           root layout, self-hosted fonts, LodgingBusiness JSON-LD
  globals.css          design tokens and component primitives
  page.tsx             home
  about/  retreats/  journal/  contact/
  not-found.tsx
  sitemap.ts  robots.ts
components/
  SiteHeader.tsx       sticky nav, transparent over hero, mobile overlay
  SiteFooter.tsx
  Reveal.tsx           IntersectionObserver scroll reveal
  Marquee.tsx          CSS-only ticker
  Icon.tsx             inline SVG icon set
  EnquiryForm.tsx      client-side enquiry form
lib/
  content.ts           ← all site content lives here
fonts/                 vendored woff2
public/images/         photography
scripts/
  check-assets.mjs     image reference integrity check
```
