import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  customer: vi.fn(), rider: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(),
}));
vi.mock("@/lib/customer-auth", () => ({ resolveCustomer: mocks.customer }));
vi.mock("@/lib/rider-auth", () => ({ requireRider: mocks.rider, RiderAuthError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));
const db = { from: () => ({ update: mocks.update }) };
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => ({ from: () => ({ update: mocks.update }) }) }));
import { PATCH as customerPatch } from "../account/profile/route";
import { PATCH as riderPatch } from "../rider/profile/route";
const request = (body: unknown) => new Request("https://shop.test/api/profile", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.single.mockResolvedValue({ data: { id: "customer-self", name: "New Name", phone: "01712345678" }, error: null });
  mocks.customer.mockResolvedValue({ id: "customer-self", name: "Old", phone: "01712345678" });
  mocks.rider.mockResolvedValue({ rider: { id: "rider-self" }, user: { id: "user-self" }, service: db });
});
describe("profile APIs", () => {
  it("rejects signed-out customers", async () => {
    mocks.customer.mockResolvedValue(null);
    expect((await customerPatch(request({ name: "Name" }))).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("writes only the customer from the session and returns no secrets", async () => {
    const res = await customerPatch(request({ name: " New Name " }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ name: "New Name" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "customer-self");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses target ID or phone replacement", async () => {
    expect((await customerPatch(request({ name: "Name", id: "victim" }))).status).toBe(422);
    expect((await customerPatch(request({ name: "Name", phone: "01812345678" }))).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks cross-site browser writes", async () => {
    const req = request({ name: "Name" }); req.headers.set("sec-fetch-site", "cross-site");
    expect((await customerPatch(req)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rider cannot change approval or cash", async () => {
    const res = await riderPatch(request({ name: "Name", phone: "01712345678", vehicle: "bike", status: "active", cash_in_hand: 0 }));
    expect(res.status).toBe(422); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rider writes use the authenticated rider and report phone collisions", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    const res = await riderPatch(request({ name: "Name", phone: "01712345678", vehicle: "bike" }));
    expect(res.status).toBe(409);
    expect(mocks.eq).toHaveBeenCalledWith("id", "rider-self");
  });
});
