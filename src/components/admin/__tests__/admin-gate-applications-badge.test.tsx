/**
 * Admin shell nav (apply = sign up, 2026-09-26): pending shop / rider
 * applications show as a count on the Shops and Riders links.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  applications: { shops: 0, riders: 0, resets: 0, total: 0 },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
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
  useStaffLive: () => ({ live: false, checked: true, error: null, retry: () => {} }),
}));
vi.mock("@/lib/use-now", () => ({ useNow: () => Date.now() }));
vi.mock("@/lib/use-applications-pending", () => ({
  useApplicationsPending: () => state.applications,
}));

import AdminGate from "../admin-gate";

afterEach(() => {
  cleanup();
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
