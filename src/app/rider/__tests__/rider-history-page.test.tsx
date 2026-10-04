import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RiderHistoryItem } from "@/lib/rider-history";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-rider", () => ({ useRiderSession: () => ({ status: "authed", rider: { id: "r1" } }) }));
const dispute = vi.hoisted(() => ({ hook: { items: [], ready: true, raise: async () => null, refresh: async () => {} } as Record<string, unknown> }));
vi.mock("@/lib/use-rider-disputes", () => ({ useRiderDisputes: () => dispute.hook }));
vi.mock("@/lib/use-rider-history", () => ({ useRiderHistory: () => state.hook }));

import RiderHistoryPage from "../history/page";

const item = (over: Partial<RiderHistoryItem> = {}): RiderHistoryItem => ({
  id: "a1", orderNo: "PS-1001", outcome: "delivered", at: Date.parse("2026-10-01T10:00:00+06:00"),
  cursor: "c", shopName: "Arian Fashion", area: "Kandirpar", isReturn: false, payment: "cod", cash: 50000, earned: 5000, ...over,
});

const base = (over: Record<string, unknown> = {}) => ({
  items: [], hasMore: false, loading: false, error: null, refresh: vi.fn(), loadMore: vi.fn(), ...over,
});

afterEach(cleanup);

describe("<RiderHistoryPage>", () => {
  it("shows each trip with its shop, area, earnings and the cash collected", () => {
    state.hook = base({ items: [item()] });
    render(<RiderHistoryPage />);
    const row = screen.getByTestId("history-item");
    expect(row.textContent).toContain("#PS-1001");
    expect(row.textContent).toContain("Arian Fashion → Kandirpar");
    expect(row.textContent).toContain("+৳50");
    expect(row.textContent).toContain("ক্যাশ নিয়েছেন ৳500");
    expect(screen.getByTestId("history-day-total").textContent).toContain("1 ডেলিভারি");
  });

  it("marks a failed trip with the rider's own reason and no earnings", () => {
    state.hook = base({ items: [item({ outcome: "failed", cash: 0, earned: 0, failedReason: "গেট বন্ধ" })] });
    render(<RiderHistoryPage />);
    const row = screen.getByTestId("history-item");
    expect(row.getAttribute("data-outcome")).toBe("failed");
    expect(row.textContent).toContain("ব্যর্থ");
    expect(row.textContent).toContain("কারণ: গেট বন্ধ");
  });

  it("says a wallet-paid trip needed no cash", () => {
    state.hook = base({ items: [item({ payment: "bkash", cash: 0 })] });
    render(<RiderHistoryPage />);
    expect(screen.getByTestId("history-item").textContent).toContain("bKash — আগেই পরিশোধিত");
  });

  it("empty state, and 'load more' only when there is another page", () => {
    state.hook = base();
    const { unmount } = render(<RiderHistoryPage />);
    expect(screen.getByTestId("history-empty")).toBeTruthy();
    expect(screen.queryByTestId("history-more")).toBeNull();
    unmount();
    const loadMore = vi.fn();
    state.hook = base({ items: [item()], hasMore: true, loadMore });
    render(<RiderHistoryPage />);
    fireEvent.click(screen.getByTestId("history-more"));
    expect(loadMore).toHaveBeenCalled();
  });

  it("shows a load error", () => {
    state.hook = base({ error: "Could not load your history." });
    render(<RiderHistoryPage />);
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
  });
  it("lets the rider report a problem on a trip, then shows their complaint and the office's answer", async () => {
    const raise = vi.fn().mockResolvedValue(null);
    dispute.hook = {
      items: [
        { id: "d1", category: "missing_fee", message: "ফি আসেনি", orderNo: "PS-1001", claimedAmount: null, status: "approved", adjustmentAmount: 4000, note: "ফি যোগ করা হয়েছে", at: 1, decidedAt: 2 },
      ],
      ready: true, raise, refresh: async () => {},
    };
    state.hook = base({ items: [item()] });
    render(<RiderHistoryPage />);
    const mine = screen.getByTestId("dispute-item");
    expect(mine.getAttribute("data-status")).toBe("approved");
    expect(mine.textContent).toContain("অফিস: ফি যোগ করা হয়েছে");
    expect(mine.textContent).toContain("ওয়ালেট +৳40");

    fireEvent.click(screen.getByTestId("dispute-open"));
    fireEvent.change(screen.getByLabelText(/কী হয়েছে/), { target: { value: "কাস্টমার কম টাকা দিয়েছেন" } });
    fireEvent.click(screen.getByRole("button", { name: "অভিযোগ পাঠান" }));
    await screen.findByText(/অভিযোগ জমা হয়েছে/);
    expect(raise).toHaveBeenCalledWith({ category: "missing_fee", message: "কাস্টমার কম টাকা দিয়েছেন", claimedTaka: undefined, assignmentId: "a1" });
  });

  it("hides the report button when disputes are not set up", () => {
    dispute.hook = { items: [], ready: false, raise: async () => null, refresh: async () => {} };
    state.hook = base({ items: [item()] });
    render(<RiderHistoryPage />);
    expect(screen.queryByTestId("dispute-open")).toBeNull();
  });
});
