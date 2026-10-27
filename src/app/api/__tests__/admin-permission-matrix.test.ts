/**
 * The admin permission matrix (audit 2026-10-09).
 *
 * `staffRoute` gates by role only when a route asks for it — `opts.roles`.
 * Operational reads remain staff-wide. Finance approval/reporting also have
 * independent SQL RPC/RLS boundaries (20261025); this scan protects the API
 * layer against accidentally removing a role option during refactoring.
 *
 * Two layers of protection:
 *   1. a static scan that fails if any listed handler loses its gate;
 *   2. one live 403 — PATCH /api/admin/settings holds the shop's own
 *      bKash/Nagad numbers, so a manager being able to write it is the
 *      difference between a typo and money going somewhere else.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  role: "manager" as "manager" | "admin",
  writes: [] as unknown[],
}));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {
    status: 401 | 403 = 403;
    constructor(message: string, status: 401 | 403) {
      super(message);
      this.status = status;
    }
  },
  requireStaff: async () => ({ user: { id: "staff-1" }, role: state.role, db: {} }),
  requireStaffRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) {
      const { StaffAuthError } = await import("@/lib/staff-auth");
      throw new StaffAuthError("Admin access is required for this action.", 403);
    }
    return { user: { id: "staff-1" }, role: state.role, db: {} };
  },
}));
vi.mock("@/lib/db/engagement", () => ({
  readOpsSettings: async () => ({ lowStockThreshold: 5 }),
  writeOpsSettings: async (_db: unknown, body: unknown) => {
    state.writes.push(body);
    return body;
  },
}));
vi.mock("@/lib/public-cache", () => ({
  CACHE_TAG_OPS: "ops",
  revalidateCatalogCaches: () => {},
}));

import { PATCH } from "../admin/settings/route";

/* ------------------------------------------------------------------ */
/* 1. The static matrix                                                */
/* ------------------------------------------------------------------ */

const ADMIN_ROOT = join(process.cwd(), "src/app/api/admin");

/** Every `route.ts` under /api/admin, as paths relative to that root. */
const routeFiles = (dir: string, base = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return routeFiles(join(dir, entry.name), rel);
    return entry.name === "route.ts" ? [rel] : [];
  });

/** The text inside the balanced parens that start at `open`. */
const callArgs = (source: string, open: number): string => {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
};

/** Which verbs in this file ask for specific roles. `roles:` may be a literal,
 *  a shared const array (`roles: ADMIN_ONLY`) or spread from a const object. */
const gatedVerbs = (file: string): string[] => {
  const source = readFileSync(join(ADMIN_ROOT, file), "utf8");
  const consts = new Map<string, string>();
  for (const m of source.matchAll(/const (\w+)\s*=\s*(\{[^{}]*\}|\[[^\]]*\][^;\n]*)/g)) {
    consts.set(m[1], m[2]);
  }
  const gated: string[] = [];
  for (const m of source.matchAll(
    /export const (GET|POST|PATCH|PUT|DELETE) = staffRoute\(/g,
  )) {
    const args = callArgs(source, m.index! + m[0].length - 1);
    const literal = /roles:\s*\[[^\]]*\]/.test(args);
    const named = /roles:\s*([A-Za-z_]\w*)/.exec(args);
    const spread = [...args.matchAll(/\.\.\.([A-Za-z_]\w*)/g)].some((sp) =>
      (consts.get(sp[1]) ?? "").includes("roles"),
    );
    const resolved = named ? consts.has(named[1]) : false;
    if (literal || spread || resolved) gated.push(m[1]);
  }
  return gated;
};

/** Money and access: what a manager must never reach. */
const MUST_BE_ADMIN_ONLY: [file: string, verb: string, why: string][] = [
  ["rider-disputes/[id]/route.ts", "POST", "decides financial disputes"],
  ["orders/[id]/payment/route.ts", "POST", "verifies platform payments"],
  ["dispatch-settings/route.ts", "PATCH", "changes cash cap and failed-delivery pay"],
  // --- money out / balances -------------------------------------------
  ["riders/route.ts", "POST", "creates/edits rider identity and lifecycle"],
  ["riders/[id]/settle/route.ts", "POST", "hands a rider their cash"],
  ["riders/[id]/settle-claim/route.ts", "POST", "settles a rider's claim"],
  ["riders/[id]/adjust/route.ts", "POST", "edits a rider's balance"],
  ["payouts/route.ts", "POST", "pays a payout request"],
  ["money/route.ts", "POST", "writes rider pay settings"],
  ["money/route.ts", "PATCH", "writes rider pay settings"],
  ["reports/best-sellers/route.ts", "GET", "reads revenue ranking"],
  ["reports/funnel/route.ts", "GET", "reads sales/AOV analytics"],
  ["money/export/route.ts", "GET", "downloads the books"],
  ["money/route.ts", "GET", "reads platform financial reports"],
  ["money/audit/route.ts", "GET", "reads financial audit history"],
  ["money/daily/route.ts", "GET", "reads reconciliation"],
  ["payouts/route.ts", "GET", "reads payout queue and balances"],
  ["riders/[id]/overview/route.ts", "GET", "reads full rider financial dossier"],
  // --- where customer money goes --------------------------------------
  ["settings/route.ts", "PATCH", "holds the shop's bKash/Nagad numbers"],
  // --- who gets a login ------------------------------------------------
  ["staff/route.ts", "GET", "the staff roster"],
  ["staff/route.ts", "POST", "grants a staff role"],
  ["staff/route.ts", "DELETE", "revokes a staff role"],
  ["riders/[id]/link-rider/route.ts", "POST", "binds a rider login"],
  ["shops/[id]/link-vendor/route.ts", "POST", "binds a vendor login"],
  ["riders/[id]/reset-password/route.ts", "POST", "resets a rider password"],
  ["shops/[id]/reset-password/route.ts", "POST", "resets a vendor password"],
  // --- identity / vetting ----------------------------------------------
  ["riders/[id]/review/route.ts", "POST", "approves or suspends a rider"],
  ["riders/[id]/licence/route.ts", "PATCH", "edits KYC document state"],
  ["shops/[id]/review/route.ts", "POST", "approves or suspends a shop"],
  ["shops/[id]/verification/route.ts", "POST", "changes shop verification"],
  ["access-requests/[id]/route.ts", "POST", "grants panel access"],
  // --- shop shape -------------------------------------------------------
  ["shops/route.ts", "POST", "creates a shop (its detail read is admin-only)"],
  ["shops/[id]/commission/route.ts", "GET", "the commission ledger"],
  // --- broadcast to everyone -------------------------------------------
  ["push/broadcast/route.ts", "GET", "reads the broadcast log"],
  ["push/broadcast/route.ts", "POST", "pushes to every customer"],
];

describe("admin permission matrix — money and access are admin-only", () => {
  it.each(MUST_BE_ADMIN_ONLY)("%s %s is gated (%s)", (file, verb) => {
    expect(gatedVerbs(file)).toContain(verb);
  });

  it("the scan actually reads the tree (a silent no-op would pass everything)", () => {
    const files = routeFiles(ADMIN_ROOT);
    expect(files.length).toBeGreaterThan(60);
    expect(gatedVerbs("settings/route.ts")).toEqual(["PATCH"]);
    // Operational settings remain readable; financial payout reports do not.
    expect(gatedVerbs("settings/route.ts")).not.toContain("GET");
    expect(gatedVerbs("payouts/route.ts")).toContain("GET");
  });
});

/* ------------------------------------------------------------------ */
/* 2. One live 403 — the gate is real, not decorative                   */
/* ------------------------------------------------------------------ */

describe("PATCH /api/admin/settings", () => {
  beforeEach(() => {
    state.role = "manager";
    state.writes = [];
  });

  const patch = (body: unknown) =>
    (PATCH as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    );

  it("refuses a manager — the bKash/Nagad number is not daily operations", async () => {
    const res = await patch({ wallets: { bkash: "01711111111", nagad: "" } });
    expect(res.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });

  it("lets an admin through", async () => {
    state.role = "admin";
    const res = await patch({ wallets: { bkash: "01711111111", nagad: "" } });
    expect(res.status).toBe(200);
    expect(state.writes).toHaveLength(1);
  });
});
