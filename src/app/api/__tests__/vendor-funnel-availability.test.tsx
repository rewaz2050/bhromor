import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VendorContext } from "@/lib/vendor-auth";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  service: null as unknown,
  rpc: vi.fn(),
  auth: vi.fn(),
  allowed: true,
  serviceError: null as Error | null,
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => {
    if (state.serviceError) throw state.serviceError;
    return state.service;
  },
  getSupabaseServer: async () => null,
}));
vi.mock("@/lib/vendor-auth", async (original) => ({
  ...(await original<typeof import("@/lib/vendor-auth")>()),
  requireVendor: state.auth,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: state.allowed, retryAfterSec: 30 }),
}));
import { GET } from "../vendor/funnel/route";
import { VendorAuthError } from "@/lib/vendor-auth";
import {
  ShopFunnelMissingError,
  shopFunnelReport,
} from "@/lib/db/vendor-funnel";
import { useVendorFunnel } from "@/lib/use-vendor";
import FunnelCard from "@/components/vendor/funnel-card";

const raw = {
  days: 7,
  shop_id: "session-shop",
  sessions: 0,
  page_views: 0,
  pdp_sessions: 0,
  atc_sessions: 0,
  checkout_sessions: 0,
  purchase_sessions: 0,
  orders: 0,
  revenue: 0,
  aov: null,
  units: 0,
  atc_by_source: [],
  top_products: [],
};
const request = (query = "days=7") =>
  new Request(`https://verification.invalid/api/vendor/funnel?${query}`);
beforeEach(() => {
  state.rpc.mockReset();
  state.auth.mockReset();
  state.allowed = true;
  state.serviceError = null;
  state.service = { rpc: state.rpc };
  state.rpc.mockResolvedValue({ data: raw, error: null });
  state.auth.mockResolvedValue({
    user: { id: "vendor-user" },
    shopId: "session-shop",
    role: "owner",
    db: {},
  } as unknown as VendorContext);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  { code: "57014", message: "statement timeout in ps_shop_funnel_report" },
  {
    code: "42501",
    message: "permission denied for function ps_shop_funnel_report",
  },
  { code: "08006", message: "connection failure" },
  { message: "permission denied for function ps_shop_funnel_report" },
  { message: "function unrelated_report() does not exist" },
  {
    code: "57014",
    message:
      "function ps_shop_funnel_report does not exist in timeout diagnostic",
  },
])(
  "RPC failure is unavailable, never a fake empty report or missing migration: %j",
  async (error) => {
    state.rpc.mockResolvedValueOnce({ data: null, error });
    const result = await GET(request());
    const body = await result.json();
    expect(result.status).toBe(503);
    expect(body.error).toBe(
      "The funnel report is temporarily unavailable. Try again.",
    );
    expect(body.missing).not.toBe(true);
    expect(body.sessions).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(error.message);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  },
);
it.each(["PGRST202", "42883", "42P01"])(
  "explicit missing-schema code %s retains migration guidance",
  async (code) => {
    state.rpc.mockResolvedValueOnce({
      data: null,
      error: { code, message: "Missing database object" },
    });
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ missing: true });
  },
);
it("an unconfigured service client is not proof of an uninstalled migration", async () => {
  state.service = null;
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({
    error: "The funnel report is temporarily unavailable. Try again.",
  });
  expect(state.rpc).not.toHaveBeenCalled();
});
it("a genuine successful zero-count report remains HTTP 200", async () => {
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    sessions: 0,
    orders: 0,
    revenue: 0,
    days: 7,
  });
});
it("a thrown RPC transport failure does not become zero visitors", async () => {
  state.rpc.mockRejectedValueOnce(new Error("Internal connection detail"));
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({
    error: "The funnel report is temporarily unavailable. Try again.",
  });
});
it("empty session shop identity never triggers a service query or migration instruction", async () => {
  state.auth.mockResolvedValueOnce({
    user: { id: "vendor-user" },
    shopId: "",
    role: "owner",
    db: {},
  });
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect((await result.json()).missing).not.toBe(true);
  expect(state.rpc).not.toHaveBeenCalled();
});
it.each([7, 28, 999])(
  "the route keeps day parsing and ignores a client-supplied shop ID: %i",
  async (days) => {
    state.rpc.mockResolvedValueOnce({
      data: { ...raw, days: days === 28 ? 28 : 7 },
      error: null,
    });
    const result = await GET(request(`days=${days}&shopId=other-shop`));
    expect(result.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("ps_shop_funnel_report", {
      p_shop_id: "session-shop",
      p_days: days === 28 ? 28 : 7,
    });
  },
);
it.each([401, 403] as const)(
  "existing auth denial %i happens before service access",
  async (status) => {
    state.auth.mockRejectedValueOnce(
      new VendorAuthError("Access denied", status),
    );
    const result = await GET(request());
    expect(result.status).toBe(status);
    expect(await result.json()).toMatchObject({ error: "Access denied" });
    expect(state.rpc).not.toHaveBeenCalled();
  },
);
it("existing rate limit is preserved", async () => {
  state.allowed = false;
  const result = await GET(request());
  expect(result.status).toBe(429);
  expect(result.headers.get("Retry-After")).toBe("30");
  expect(state.rpc).not.toHaveBeenCalled();
});
it("merely mentioning the RPC in a non-schema error must not classify it as missing", async () => {
  state.rpc.mockResolvedValueOnce({
    data: null,
    error: {
      code: "42501",
      message: "permission denied for function ps_shop_funnel_report",
    },
  });
  await expect(
    shopFunnelReport(
      state.service as Parameters<typeof shopFunnelReport>[0],
      "session-shop",
      7,
    ),
  ).rejects.not.toBeInstanceOf(ShopFunnelMissingError);
});
function Probe() {
  const result = useVendorFunnel(true);
  return (
    <FunnelCard
      funnel={result.funnel}
      loading={result.loading}
      missing={result.missing}
      error={result.error}
      onRetry={result.refresh}
    />
  );
}
it("server → client → card shows Retry on outage and real quiet-shop copy only after recovery", async () => {
  state.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "57014", message: "statement timeout" },
  });
  vi.stubGlobal("fetch", (url: string) =>
    GET(new Request(new URL(url, "https://verification.invalid"))),
  );
  render(<Probe />);
  await screen.findByText(
    "The funnel report is temporarily unavailable. Try again.",
  );
  expect(screen.queryByTestId("funnel-quiet")).not.toBeInTheDocument();
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByTestId("funnel-quiet")).toHaveTextContent(
    "No visitors recorded yet",
  );
});

it.each([
  "Could not find the function public.ps_shop_funnel_report(p_days, p_shop_id) in the schema cache",
  "function public.ps_shop_funnel_report(uuid, integer) does not exist",
  'relation "public.storefront_events" does not exist',
])(
  "uncoded confirmed target-schema absence retains migration guidance: %s",
  async (message) => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { message } });
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ missing: true });
  },
);
it("service initialization exceptions are unavailable, not missing schema", async () => {
  state.serviceError = new Error("Private service configuration detail");
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({
    error: "The funnel report is temporarily unavailable. Try again.",
  });
  expect(state.rpc).not.toHaveBeenCalled();
});

it.each([
  ["null", null],
  ["empty", {}],
  ["partial", { sessions: 0 }],
  ["wrong shop", { ...raw, shop_id: "other-shop" }],
  ["wrong days", { ...raw, days: 28 }],
  ["coercible metric", { ...raw, revenue: "0" }],
  ["malformed sources", { ...raw, atc_by_source: [null] }],
  ["malformed products", { ...raw, top_products: [{ product_id: "p1" }] }],
] as const)(
  "invalid successful RPC %s becomes generic unavailable, never migration/analytics",
  async (_label, data) => {
    state.rpc.mockResolvedValueOnce({ data, error: null });
    const result = await GET(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: "The funnel report is temporarily unavailable. Try again.",
    });
  },
);
it("malformed successful RPC → route → hook → card supports retry into genuine empty data", async () => {
  state.rpc.mockResolvedValueOnce({ data: null, error: null });
  vi.stubGlobal("fetch", (url: string) =>
    GET(new Request(new URL(url, "https://verification.invalid"))),
  );
  render(<Probe />);
  await screen.findByText(
    "The funnel report is temporarily unavailable. Try again.",
  );
  expect(screen.queryByTestId("funnel-quiet")).not.toBeInTheDocument();
  expect(screen.queryByTestId("funnel-missing")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByTestId("funnel-quiet")).toHaveTextContent(
    "No visitors recorded yet",
  );
});
