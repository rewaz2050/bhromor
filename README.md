# bhromor

E-commerce storefront for **PROSANTI** — built with Next.js (App Router), TypeScript, Tailwind CSS, and Vitest.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command            | Description                                   |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Start the development server                  |
| `npm run build`    | Production build (what Vercel runs)           |
| `npm run start`    | Serve the production build                    |
| `npm run lint`     | Run ESLint                                    |
| `npm run typecheck`| Type-check the whole project (`tsc --noEmit`) |
| `npm test`         | Run tests once (Vitest)                       |

## Quality gates (all green before a Vercel deploy)

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Deploying to Vercel

1. Merge the open PR (`arena/…` → `main`) so `main` holds the storefront.
2. At [vercel.com/new](https://vercel.com/new), **Import** the `rewaz2050/bhromor` repository. Vercel auto-detects Next.js; no settings need to change.
3. Deploy. From then on, every push to `main` auto-deploys.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript** · **Tailwind CSS v4** · **Vitest** + Testing Library

Fonts (Inter Variable, Playfair Display Variable) are self-hosted via Fontsource — no runtime fetch to Google Fonts, so builds are reliable from any network.

## Structure

```
src/
├── app/                    # Routes, layouts, page components
│   ├── __tests__/          # Vitest smoke tests
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
└── components/             # Reusable UI components (as we build)
```
