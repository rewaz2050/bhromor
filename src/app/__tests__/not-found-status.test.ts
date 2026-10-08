/**
 * The 404 status is decided by file placement, not by code (scan 2026-10-08).
 *
 * Next can only answer 404 before the response starts streaming, and a
 * `loading.tsx` anywhere ABOVE a route makes it stream immediately — so every
 * `notFound()` below one answers HTTP 200 with the 404 page (a soft 404).
 * `src/app/(site)/loading.tsx` used to do that to the whole storefront.
 *
 * Nothing in the unit suite can see this: the page renders perfectly either
 * way. This test guards the one thing that keeps the status honest — which
 * directories are allowed to carry a loading file.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Routes that can refuse a request: a piece or a shop that is not there.
 * No streaming boundary may sit above them.
 */
const REFUSABLE = [
  "src/app/(site)/product/[slug]",
  "src/app/(site)/shops/[slug]",
  "src/app/(site)/shops/[slug]/p/[product]",
];

/** Their ancestors inside the storefront — a loading file here leaks too. */
const ANCESTORS = ["src/app/(site)", "src/app/(site)/shops", "src/app/(site)/product"];

describe("404 status", () => {
  it("keeps the storefront's group-wide loading file away", () => {
    // This single file made every storefront 404 a soft 404.
    expect(existsSync("src/app/(site)/loading.tsx")).toBe(false);
  });

  it("puts no streaming boundary above a route that can refuse", () => {
    for (const dir of [...REFUSABLE, ...ANCESTORS]) {
      expect(
        existsSync(`${dir}/loading.tsx`),
        `${dir}/loading.tsx would stream the shell and turn notFound() into a 200`,
      ).toBe(false);
    }
  });

  it("keeps the catch-all that turns unknown URLs into a 404", () => {
    expect(existsSync("src/app/(site)/[...missing]/page.tsx")).toBe(true);
    expect(existsSync("src/app/(site)/not-found.tsx")).toBe(true);
  });

  it("still lets routes that always exist keep their skeleton", () => {
    // A listing is never missing — it has no status to lose.
    for (const dir of ["src/app/(site)/(home)", "src/app/(site)/shop", "src/app/(site)/offers"]) {
      expect(existsSync(`${dir}/loading.tsx`), `${dir}/loading.tsx`).toBe(true);
    }
  });
});
