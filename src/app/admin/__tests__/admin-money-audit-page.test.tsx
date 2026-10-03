import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MoneyAuditEntry } from "@/lib/money-audit";

const state = vi.hoisted(() => ({
  hook: {} as Record<string, unknown>,
}));
vi.mock("@/lib/use-money-audit", () => ({ useMoneyAudit: () => state.hook }));

import MoneyAuditPage from "../money/audit/page";

const entry = (over: Partial<MoneyAuditEntry> = {}): MoneyAuditEntry => ({
  id: "e1", at: Date.parse("2026-10-01T10:00:00Z"), actorId: "u1", actorEmail: "owner@prosanti.test",
  event: "shop_payout", subjectType: "shop", subjectId: "11111111-2222", amount: 90000,
  detail: { method: "bkash", reference: "SP-1" }, ...over,
});

const base = (over: Record<string, unknown> = {}) => ({
  live: true, checked: true, event: "all", setEvent: vi.fn(), entries: [], ready: true, loading: false, error: null, refresh: vi.fn(), ...over,
});

afterEach(cleanup);

describe("<MoneyAuditPage>", () => {
  it("lists who did what, with the amount", () => {
    state.hook = base({ entries: [entry()] });
    render(<MoneyAuditPage />);
    const row = screen.getByTestId("audit-row");
    expect(row.textContent).toContain("Shop payout recorded");
    expect(row.textContent).toContain("BKASH · SP-1");
    expect(row.textContent).toContain("owner@prosanti.test");
    expect(row.textContent).toContain("৳900");
  });

  it("links to the CSV export pre-set to the audit ledger", () => {
    state.hook = base({ entries: [entry()] });
    render(<MoneyAuditPage />);
    expect(screen.getByTestId("audit-export")).toHaveAttribute("href", "/admin/money/export?kind=audit");
  });

  it("names the migration when the trail is not installed", () => {
    state.hook = base({ ready: false });
    render(<MoneyAuditPage />);
    expect(screen.getByTestId("audit-missing").textContent).toContain("202610010006_money_audit.sql");
  });

  it("changing the filter asks the hook for that event", () => {
    const setEvent = vi.fn();
    state.hook = base({ setEvent });
    render(<MoneyAuditPage />);
    fireEvent.change(screen.getByTestId("audit-filter"), { target: { value: "rate_change" } });
    expect(setEvent).toHaveBeenCalledWith("rate_change");
  });

  it("shows an empty state, and falls back to 'system' for a service-role action", () => {
    state.hook = base();
    const { unmount } = render(<MoneyAuditPage />);
    expect(screen.getByText(/কোনো entry নেই/)).toBeTruthy();
    unmount();
    state.hook = base({ entries: [entry({ actorId: null, actorEmail: null })] });
    render(<MoneyAuditPage />);
    expect(screen.getByTestId("audit-row").textContent).toContain("system / service");
  });
});
