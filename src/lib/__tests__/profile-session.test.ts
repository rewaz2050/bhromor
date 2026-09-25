import { afterEach, expect, it, vi } from "vitest";
import { __resetCustomerProbe, __resetLiveAuthForTests, getAuthSnapshot, probeCustomerSession } from "../customer-session";
afterEach(() => { vi.unstubAllGlobals(); __resetLiveAuthForTests(); });
it("publishes a changed name for the same customer id", async () => {
  __resetLiveAuthForTests();
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ customer: { id: "1", name: "Old", phone: "01712345678" } }))
    .mockResolvedValueOnce(Response.json({ customer: { id: "1", name: "New", phone: "01712345678" } }));
  vi.stubGlobal("fetch", fetcher);
  await probeCustomerSession(); const before = getAuthSnapshot();
  __resetCustomerProbe(); await probeCustomerSession(); const after = getAuthSnapshot();
  expect(after).not.toBe(before); expect(after.customer?.name).toBe("New");
});
