/** Item P: the public abuse-prone routes must use the shared (durable) limiter, not just the per-instance one. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  "account/login", "account/signup", "auth/reset-request", "auth/reset-complete", "orders",
  "contact", "riders/apply", "shops/apply", "returns", "reviews",
];

describe("durable rate limit wiring", () => {
  it.each(ROUTES)("/api/%s awaits the durable limiter", (r) => {
    const src = readFileSync(join(process.cwd(), "src/app/api", r, "route.ts"), "utf8");
    expect(src).toContain("await checkDurableRateLimit(");
    expect(src).not.toMatch(/[^e]checkRateLimit\(/);
  });
});
