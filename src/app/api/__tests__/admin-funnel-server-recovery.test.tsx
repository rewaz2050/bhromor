import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: vi.fn(),
  allowed: true,
}));
vi.mock("@/lib/staff-auth", async (original) => ({
  ...(await original<typeof import("@/lib/staff-auth")>()),
  requireStaff: state.auth,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: state.allowed, retryAfterSec: 30 }),
}));
vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowser: () => null }));
import { GET } from "../admin/reports/funnel/route";
import { StaffAuthError } from "@/lib/staff-auth";
import FunnelCard from "@/components/admin/funnel-card";
const raw = {
  days: 7,
  sessions: 100,
  page_views: 200,
  bounced_sessions: 25,
  pdp_sessions: 60,
  atc_sessions: 30,
  checkout_sessions: 20,
  purchase_sessions: 10,
  orders: 12,
  aov: 125000,
  customers: 10,
  repeat_customers: 2,
  atc_by_source: [{ source: "pdp", count: 30 }],
  top_searches: [{ query: "saree", count: 4, max_results: 0 }],
  home_sessions: 40,
  home_scroll: [{ depth: 50, sessions: 20 }],
};
const quiet = {
  days: 7,
  sessions: 0,
  page_views: 0,
  bounced_sessions: 0,
  pdp_sessions: 0,
  atc_sessions: 0,
  checkout_sessions: 0,
  purchase_sessions: 0,
  orders: 0,
  aov: null,
  customers: 0,
  repeat_customers: 0,
  home_sessions: 0,
  atc_by_source: [],
  top_searches: [],
  home_scroll: [],
};
const request = (query = "days=7") =>
  new Request(`https://verification.invalid/api/admin/reports/funnel?${query}`);
const safe = { error: "Something went wrong — please try again." };
beforeEach(() => {
  state.rpc.mockReset();
  state.auth.mockReset();
  state.allowed = true;
  localStorage.clear();
  state.rpc.mockResolvedValue({ data: raw, error: null });
  state.auth.mockResolvedValue({
    user: { id: "staff-user" },
    role: "manager",
    db: { rpc: state.rpc },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([
  ["null", null],
  ["empty", {}],
  ["partial", { sessions: 0 }],
  ["wrong window", { ...raw, days: 28 }],
  ["coercible metric", { ...raw, sessions: "0" }],
  ["bad sources", { ...raw, atc_by_source: [null] }],
  ["bad search", { ...raw, top_searches: [{ query: "q", count: 1 }] }],
  ["bad scroll", { ...raw, home_scroll: [{ depth: 50 }] }],
] as const)(
  "malformed successful RPC %s becomes safe unavailable, not fabricated analytics/migration",
  async (_label, data) => {
    state.rpc.mockResolvedValueOnce({ data, error: null });
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual(safe);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  },
);
it.each([
  { code: "57014", message: "statement timeout in ps_funnel_report" },
  { code: "42501", message: "permission denied for function ps_funnel_report" },
  { code: "08006", message: "private connection detail" },
  {
    code: "57014",
    message:
      "function public.ps_funnel_report does not exist in timeout diagnostic",
  },
  { message: "function unrelated_report() does not exist" },
])("operational error stays safe generic unavailable: %j", async (error) => {
  state.rpc.mockResolvedValueOnce({ data: null, error });
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual(safe);
});
it.each([
  { code: "PGRST202", message: "Missing function" },
  { code: "42883", message: "Missing function" },
  { code: "42P01", message: "Missing table" },
  {
    message:
      "Could not find the function public.ps_funnel_report(p_days) in the schema cache",
  },
  { message: "function public.ps_funnel_report(integer) does not exist" },
  { message: 'relation "public.storefront_events" does not exist' },
])(
  "supported schema absence preserves migration metadata: %j",
  async (error) => {
    state.rpc.mockResolvedValueOnce({ data: null, error });
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ missing: true });
  },
);
it.each([7, 28, 999])(
  "preserves day parsing and real metrics: %i",
  async (days) => {
    const expected = days === 28 ? 28 : 7;
    state.rpc.mockResolvedValueOnce({
      data: { ...raw, days: expected },
      error: null,
    });
    const result = await GET(request(`days=${days}`));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      days: expected,
      sessions: 100,
      bounceRate: 0.25,
      pagesPerSession: 2,
      repeatRate: 0.2,
    });
    expect(state.rpc).toHaveBeenCalledWith("ps_funnel_report", {
      p_days: expected,
    });
  },
);
it("preserves genuine empty SQL output", async () => {
  state.rpc.mockResolvedValueOnce({ data: quiet, error: null });
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ sessions: 0, aov: 0 });
});
it("thrown transport failure stays generic unavailable", async () => {
  state.rpc.mockRejectedValueOnce(new Error("Private transport detail"));
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual(safe);
});
it.each([401, 403] as const)(
  "preserves staff denial %i before querying",
  async (status) => {
    state.auth.mockRejectedValueOnce(
      new StaffAuthError("Access denied", status),
    );
    const result = await GET(request());
    expect(result.status).toBe(status);
    expect(state.rpc).not.toHaveBeenCalled();
  },
);
it("preserves rate limiting before querying", async () => {
  state.allowed = false;
  const result = await GET(request());
  expect(result.status).toBe(429);
  expect(result.headers.get("Retry-After")).toBe("30");
  expect(state.rpc).not.toHaveBeenCalled();
});
it.each(["malformed success", "operational failure"])(
  "actual route → apiGet → card supports recovery from %s",
  async (kind) => {
    state.rpc.mockResolvedValueOnce(
      kind === "malformed success"
        ? { data: null, error: null }
        : {
            data: null,
            error: { code: "57014", message: "statement timeout" },
          },
    );
    state.rpc.mockResolvedValue({ data: quiet, error: null });
    vi.stubGlobal("fetch", (url: string) =>
      GET(new Request(new URL(url, "https://verification.invalid"))),
    );
    render(<FunnelCard live />);
    expect(await screen.findByRole("alert")).toHaveTextContent(safe.error);
    expect(screen.queryByText(/No sessions recorded/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No sessions recorded/)).toBeInTheDocument();
  },
);
