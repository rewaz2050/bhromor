/**
 * Grouped sidebar: shape, badges that survive a folded group, remembering
 * the fold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const roleState = vi.hoisted(() => ({ role: "admin" as string | null }));
vi.mock("@/lib/use-staff-role", () => ({
  useStaffRole: () => ({ role: roleState.role, checked: true, live: true, canManage: roleState.role === "admin" || roleState.role === "super_admin" }),
}));

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminSidebarNav from "../admin-sidebar-nav";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  __resetAdminNavCache,
} from "../admin-nav";

beforeEach(() => {
  roleState.role = "admin";
  window.localStorage.clear();
  __resetAdminNavCache();
});

afterEach(cleanup);

describe("AdminSidebarNav", () => {
  it("renders every group and every link, none of them twice", () => {
    render(
      <AdminSidebarNav pathname="/admin" counts={{}} />,
    );
    for (const group of ADMIN_NAV_GROUPS) {
      expect(
        screen.getByRole("button", { name: new RegExp(group.label, "i") }),
      ).toBeInTheDocument();
    }
    // Derived, not typed: a hardcoded 26 turned adding one nav item into a
    // red suite that had nothing wrong with it.
    expect(screen.getAllByRole("link")).toHaveLength(ADMIN_NAV_ITEMS.length);
  });

  it("marks the page you are on", () => {
    render(<AdminSidebarNav pathname="/admin/money/daily" counts={{}} />);
    expect(screen.getByRole("link", { name: /Money/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Orders/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the waiting count visible when its group is folded away", () => {
    render(
      <AdminSidebarNav
        pathname="/admin"
        counts={{ shops: 2, riders: 1, resets: 3 }}
      />,
    );
    expect(screen.getAllByLabelText("2 applications waiting").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("1 application waiting")).toBeInTheDocument();
    expect(screen.getByLabelText("3 requests waiting")).toBeInTheDocument();
    // 2 + 1 + 3 — the group header carries the total.
    expect(
      screen.getByLabelText("6 waiting in People"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /People/i }));
    // Folded links leave the accessibility tree — a count on the header is
    // the only trace of them, which is why the badge moved up there.
    expect(
      screen.queryByRole("link", { name: /Access requests/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("6 waiting in People")).toBeInTheDocument();
  });

  it("remembers a folded group in this browser", () => {
    render(<AdminSidebarNav pathname="/admin" counts={{}} />);
    const money = screen.getByRole("button", { name: /Money/i });
    expect(money).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(money);
    expect(money).toHaveAttribute("aria-expanded", "false");
    expect(JSON.parse(window.localStorage.getItem("admin.nav-groups.v1") ?? "[]")).toEqual([
      "money",
    ]);

    fireEvent.click(money);
    expect(
      JSON.parse(window.localStorage.getItem("admin.nav-groups.v1") ?? "[]"),
    ).toEqual([]);
  });

  it("closes the phone drawer after a tap", () => {
    const onNavigate = vi.fn();
    render(
      <AdminSidebarNav pathname="/admin" counts={{}} onNavigate={onNavigate} />,
    );
    fireEvent.click(screen.getByRole("link", { name: /Orders/ }));
    expect(onNavigate).toHaveBeenCalled();
  });
});

it.each(["manager", null])("hides finance navigation for %s but keeps rider operations", (role) => {
  roleState.role = role;
  render(<AdminSidebarNav pathname="/admin" counts={{}} />);
  expect(screen.queryByRole("link", { name: /^Reports/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Money/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Payouts/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Payments/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Riders/ })).toBeInTheDocument();
});
