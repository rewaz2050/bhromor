/**
 * P2 #4 — /api/admin/reports/best-sellers is staff-only: the sales ranking
 * is a staff number, not a public surface.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "../admin/reports/best-sellers/route";

describe("GET /api/admin/reports/best-sellers (P2 #4)", () => {
  it("401s without a staff session", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/reports/best-sellers"),
    );
    expect(res.status).toBe(401);
  });
});
