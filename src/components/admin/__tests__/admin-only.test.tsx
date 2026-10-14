/**
 * <AdminOnly> — the UI half of the permission matrix (2026-10-09).
 *
 * The API gate is the lock; this exists so a manager running daily operations
 * does not meet a wall of buttons that answer 403. What matters is the three
 * states: an admin sees the control, a manager sees the note instead, and
 * nobody sees anything before the session probe has answered.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminOnly from "@/components/admin/admin-only";
import { canManageRole } from "@/lib/use-staff-role";

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  checked: true,
  live: true,
}));

vi.mock("@/lib/use-staff-live", () => ({
  useStaffLive: () => ({ ...state, retry: () => {} }),
}));

afterEach(cleanup);

describe("<AdminOnly>", () => {
  it("shows the control to an admin and to a super_admin", () => {
    for (const role of ["admin", "super_admin"]) {
      state.role = role;
      const { unmount } = render(
        <AdminOnly>
          <button type="button">Settle cash</button>
        </AdminOnly>,
      );
      expect(screen.getByRole("button", { name: "Settle cash" })).toBeTruthy();
      unmount();
    }
  });

  it("hides the control from a manager and says why", () => {
    state.role = "manager";
    render(
      <AdminOnly note="শুধু admin টাকা সেটল করতে পারে।">
        <button type="button">Settle cash</button>
      </AdminOnly>,
    );
    expect(screen.queryByRole("button", { name: "Settle cash" })).toBeNull();
    expect(screen.getByTestId("admin-only-note").textContent).toContain("admin");
  });

  it("hides silently when no note was given", () => {
    state.role = "manager";
    const { container } = render(
      <AdminOnly>
        <button type="button">Settle cash</button>
      </AdminOnly>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing until the probe answers — no button that then vanishes", () => {
    state.role = null;
    state.checked = false;
    const { container } = render(
      <AdminOnly note="admin only">
        <button type="button">Settle cash</button>
      </AdminOnly>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("canManageRole — the pure half", () => {
  it("is the two roles that hold money and logins", () => {
    expect(canManageRole("admin")).toBe(true);
    expect(canManageRole("super_admin")).toBe(true);
    expect(canManageRole("manager")).toBe(false);
    expect(canManageRole(null)).toBe(false);
    expect(canManageRole("")).toBe(false);
  });
});
