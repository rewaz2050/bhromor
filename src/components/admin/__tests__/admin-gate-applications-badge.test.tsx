/**
 * Admin shell nav (apply = sign up, 2026-09-26): pending shop / rider
 * applications show as a count on the Shops and Riders links.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/admin", role: null as string | null,
  live: false, checked: true, error: null as string | null,
  applications: { shops: 0, riders: 0, resets: 0, total: 0 },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/admin-auth", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/admin-auth")>();
  return {
    ...orig,
    subscribeAdminAuth: () => () => {},
    getAdminAuthed: () => true,
    refreshStaffSession: async () => true,
    signOutAdmin: async () => undefined,
  };
});
vi.mock("@/lib/env", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/env")>();
  return { ...orig, isSupabaseConfigured: () => false };
});
vi.mock("@/lib/use-notifications", () => ({
  useNotifications: () => ({ unread: 0, notifications: [], markRead: vi.fn(), markAllRead: vi.fn() }),
}));
vi.mock("@/lib/use-staff-live", () => ({
  useStaffLive: () => ({ role: state.role, live: state.live, checked: state.checked, error: state.error, retry: () => {} }),
}));
vi.mock("@/lib/use-now", () => ({ useNow: () => Date.now() }));
vi.mock("@/lib/use-applications-pending", () => ({
  useApplicationsPending: () => state.applications,
}));

import AdminGate from "../admin-gate";

afterEach(() => {
  cleanup();
  state.pathname = "/admin"; state.role = null;
  state.live = false; state.checked = true; state.error = null;
  state.applications = { shops: 0, riders: 0, resets: 0, total: 0 };
});

describe("AdminGate — application badges", () => {
  it("shows no counts when nothing is pending", () => {
    render(
      <AdminGate>
        <p>content</p>
      </AdminGate>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByLabelText(/applications? waiting/)).not.toBeInTheDocument();
  });

  it("puts the pending counts on the Shops and Riders links", () => {
    state.applications = { shops: 2, riders: 1, resets: 4, total: 7 };
    render(
      <AdminGate>
        <p>content</p>
      </AdminGate>,
    );
    const shops = screen.getAllByRole("link", { name: /Shops/ })[0];
    expect(shops).toHaveAttribute("href", "/admin/shops");
    expect(shops).toHaveTextContent(/2$/);
    const riders = screen.getAllByRole("link", { name: /Riders/ })[0];
    expect(riders).toHaveTextContent(/1$/);
    expect(screen.getAllByLabelText("2 applications waiting").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("1 application waiting").length).toBeGreaterThan(0);
    const access = screen.getAllByRole("link", { name: /Access requests/ })[0];
    expect(access).toHaveAttribute("href", "/admin/access");
    expect(access).toHaveTextContent(/4$/);
    expect(screen.getAllByLabelText("4 requests waiting").length).toBeGreaterThan(0);
  });
});


it.each([
  [false, false, "Checking session"],
  [true, true, "Session verified"],
  [true, false, "Session unavailable"],
])("reports the actual staff probe state (checked=%s, live=%s)", (checked, live, label) => {
  state.checked = checked; state.live = live;
  render(<AdminGate><p>content</p></AdminGate>);
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.queryByText("Live data")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open admin menu" })).toHaveClass("h-11", "w-11");
  expect(screen.getByRole("link", { name: /Notifications,/ })).toHaveClass("h-11", "w-11");
});

it.each(["/admin/reports", "/admin/money", "/admin/money/audit", "/admin/money/daily", "/admin/payouts", "/admin/payments", "/admin/riders/11111111-1111-4111-8111-111111111111"])("never mounts financial page hooks for Manager: %s", (path) => {
  state.pathname = path; state.role = "manager"; state.live = true;
  const fetchOnMount = vi.fn();
  function FinancialPage() { fetchOnMount(); return <p>private report</p>; }
  render(<AdminGate><FinancialPage /></AdminGate>);
  expect(screen.getByRole("heading", { name: "Admin access required" })).toBeInTheDocument();
  expect(fetchOnMount).not.toHaveBeenCalled();
});
it.each(["admin", "super_admin"])("mounts financial report only after verified %s session", (role) => {
  state.pathname = "/admin/money"; state.role = role; state.live = true;
  render(<AdminGate><p>authorized report</p></AdminGate>);
  expect(screen.getByText("authorized report")).toBeInTheDocument();
});
it.each(["/admin/riders", "/admin/riders/scorecard", "/admin/dispatch", "/admin/orders"])("keeps Manager operational route mounted: %s", (path) => {
  state.pathname = path; state.role = "manager"; state.live = true;
  render(<AdminGate><p>operational page</p></AdminGate>);
  expect(screen.getByText("operational page")).toBeInTheDocument();
});
it("does not mount financial hooks for an unchecked role", () => {
  state.pathname = "/admin/money"; state.role = "admin"; state.checked = false;
  render(<AdminGate><p>private report</p></AdminGate>);
  expect(screen.queryByText("private report")).not.toBeInTheDocument();
});
