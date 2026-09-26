/**
 * Round 4 (2026-09-26) — /api/rider/kyc[/sign] are the only rider routes
 * open to a PENDING applicant; the job/cash routes keep the active gate.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const seen = vi.hoisted(() => ({ opts: [] as { name: string; opts?: Record<string, unknown> }[] }));

vi.mock("../rider/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../rider/_lib")>();
  return {
    ...orig,
    riderRoute: (name: string, _handler: unknown, opts?: Record<string, unknown>) => {
      seen.opts.push({ name, opts });
      return async () => new Response(null, { status: 204 });
    },
  };
});

import "../rider/kyc/route";
import "../rider/kyc/sign/route";
import "../rider/me/route";

describe("rider KYC route gates", () => {
  it("lets applicants through the KYC routes only", () => {
    const byName = Object.fromEntries(seen.opts.map((o) => [o.name, o.opts]));
    expect(byName.kyc).toMatchObject({ allowApplicant: true });
    expect(byName["kyc-save"]).toMatchObject({ allowApplicant: true, limit: 20 });
    expect(byName["kyc-sign"]).toMatchObject({ allowApplicant: true });
    expect(byName.me?.allowApplicant).toBeUndefined();
  });
});
