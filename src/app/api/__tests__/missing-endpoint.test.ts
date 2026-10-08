/**
 * Every `/api/*` path nothing else claims (scan 2026-10-08).
 *
 * It used to be answered by the storefront's `[...missing]` page — a 200 with
 * the 404 HTML — so `fetch("/api/typo").then(r => r.json())` threw
 * `Unexpected token '<'` instead of hearing "no such endpoint".
 */
import { describe, expect, it } from "vitest";
import { DELETE, GET, HEAD, PATCH, POST, PUT } from "@/app/api/[...missing]/route";

describe("/api/[...missing]", () => {
  it("answers a JSON 404 — never the storefront's HTML page", async () => {
    for (const handler of [GET, POST, PUT, PATCH, DELETE, HEAD]) {
      const res = await handler();
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBeTruthy();
    }
  });
});
