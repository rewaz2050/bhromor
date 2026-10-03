import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DAILY_CHECK_KEYS, normalizeDaily } from "@/lib/money-daily";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-money-daily", () => ({ useMoneyDaily: () => state.hook }));

import MoneyDailyPage from "../money/daily/page";

const report = (bad: string[] = []) =>
  normalizeDaily({
    day: "2026-10-01",
    flows: { deliveredOrders: 12, orderValue: 1200000, codCollectedByRiders: 800000, cashHandedIn: 500000, settlementsCount: 2, settlementsNetted: 50000 },
    position: { codCustody: 300000, riderPayable: 40000, shopPayable: 700000 },
    checks: DAILY_CHECK_KEYS.map((key) => ({ key, ok: !bad.includes(key), count: bad.includes(key) ? 2 : 0, sample: bad.includes(key) ? ["abcdef1234"] : [] })),
  });

const base = (over: Record<string, unknown> = {}) => ({
  live: true, checked: true, day: "2026-10-01", setDay: vi.fn(), report: report(), ready: true, loading: false, error: null, refresh: vi.fn(), ...over,
});

afterEach(cleanup);

describe("<MoneyDailyPage>", () => {
  it("says the day is clean when every check passes", () => {
    state.hook = base();
    render(<MoneyDailyPage />);
    expect(screen.getByTestId("daily-verdict").textContent).toContain("সব check পরিষ্কার");
    expect(screen.getByTestId("flow-orders").textContent).toContain("12");
    expect(screen.getByTestId("flow-cod").textContent).toContain("৳8,000");
    expect(screen.getByTestId("flow-handed-in").textContent).toContain("netted");
    expect(screen.getByTestId("pos-custody").textContent).toContain("৳3,000");
  });

  it("shows shop-wallet money and remittances only on the days they happened", () => {
    state.hook = base();
    const { unmount } = render(<MoneyDailyPage />);
    expect(screen.getByTestId("flow-wallet").textContent).not.toMatch(/own wallets/);
    expect(screen.queryByTestId("flow-remitted")).toBeNull();
    unmount();
    state.hook = base({
      report: normalizeDaily({ day: "2026-10-01", flows: { walletPaidOrders: 900000, shopWalletOrders: 300000, shopRemittances: 50000 }, position: {}, checks: [] }),
    });
    render(<MoneyDailyPage />);
    expect(screen.getByTestId("flow-wallet").textContent).toContain("৳3,000 went to shops' own wallets");
    expect(screen.getByTestId("flow-remitted").textContent).toContain("৳500");
  });

  it("flags a failing check with what to do and a sample id", () => {
    state.hook = base({ report: report(["wallet_journal"]) });
    render(<MoneyDailyPage />);
    expect(screen.getByTestId("daily-verdict").textContent).toContain("1টি বিষয়");
    const row = screen.getByTestId("check-wallet_journal");
    expect(row.getAttribute("data-ok")).toBe("no");
    expect(row.textContent).toContain("do not pay them");
    expect(row.textContent).toContain("abcdef12");
    expect(screen.getByTestId("check-negative_cash").getAttribute("data-ok")).toBe("yes");
  });

  it("steps days; Next is disabled on today", () => {
    const setDay = vi.fn();
    state.hook = base({ setDay, day: "2026-09-30" });
    render(<MoneyDailyPage />);
    fireEvent.click(screen.getByTestId("day-prev"));
    expect(setDay).toHaveBeenCalledWith("2026-09-29");
    cleanup();
    state.hook = base({ day: "9999-12-31" });
    render(<MoneyDailyPage />);
    expect((screen.getByTestId("day-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies the plain-text summary", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    state.hook = base();
    render(<MoneyDailyPage />);
    fireEvent.click(screen.getByTestId("copy-summary"));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect((writeText.mock.calls[0] as unknown as string[])[0]).toContain("PROSANTI money — 2026-10-01");
  });

  it("names the migration when it has not run", () => {
    state.hook = base({ ready: false, report: null });
    render(<MoneyDailyPage />);
    expect(screen.getByTestId("daily-missing").textContent).toContain("202610010007_money_daily.sql");
  });
});
