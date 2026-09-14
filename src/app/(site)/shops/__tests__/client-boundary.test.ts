/**
 * R8 regression guard — the /shops page is a server component, so anything
 * it renders must not call client hooks from the server. ShopsDirectory
 * reads the language + the visitor's zone (client state); without the
 * "use client" directive Next throws "Attempted to call useLanguage()
 * from the server" at request time and the whole page falls back to the
 * loading shell. The build cannot catch this (the page is force-dynamic)
 * and jsdom tests cannot catch it (hooks work there), so the guard is a
 * static directive check.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("server/client boundary (R8)", () => {
  it("ShopsDirectory is a client component (it calls client hooks)", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "..", "..", "components", "shop", "shops-directory.tsx"),
      "utf8",
    );
    // shops-directory.tsx calls useLanguage()/useMyZone() — it must keep
    // the use client directive or /shops breaks at SSR (R8).
    expect(src.startsWith('"use client";') || src.startsWith("'use client';")).toBe(true);
  });
});
