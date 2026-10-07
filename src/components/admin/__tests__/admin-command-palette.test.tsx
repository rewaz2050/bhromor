/**
 * ⌘K palette — the shortcut past a grouped sidebar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  onClose: vi.fn(),
  onOpen: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  usePathname: () => "/admin",
}));

import AdminCommandPalette from "../command-palette";
import { ADMIN_NAV_ITEMS, __resetAdminNavCache } from "../admin-nav";

const renderPalette = (
  over: Partial<React.ComponentProps<typeof AdminCommandPalette>> = {},
) =>
  render(
    <AdminCommandPalette
      open
      onClose={h.onClose}
      onOpen={h.onOpen}
      pathname="/admin"
      counts={{}}
      {...over}
    />,
  );

beforeEach(() => {
  window.localStorage.clear();
  __resetAdminNavCache();
  h.push.mockClear();
  h.onClose.mockClear();
  h.onOpen.mockClear();
});

afterEach(cleanup);

describe("AdminCommandPalette", () => {
  it("offers every admin page, and focuses the box so you can just type", async () => {
    renderPalette();
    const input = await screen.findByRole("combobox", {
      name: /jump to an admin page/i,
    });
    expect(screen.getAllByRole("option")).toHaveLength(ADMIN_NAV_ITEMS.length);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("narrows to what was typed and opens the chosen page", async () => {
    renderPalette();
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "pay" } });

    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Payouts"),
      expect.stringContaining("Payments"),
    ]);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(h.push).toHaveBeenCalledWith("/admin/payments");
    expect(h.onClose).toHaveBeenCalled();
  });

  it("wraps with the arrow keys — up from the first lands on the last", async () => {
    renderPalette();
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "pay" } });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.push).toHaveBeenCalledWith("/admin/payments");
  });

  it("opens on ⌘K / Ctrl+K from anywhere, and not on a plain 'k'", async () => {
    renderPalette({ open: false });
    fireEvent.keyDown(window, { key: "k" });
    expect(h.onOpen).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(h.onOpen).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("shows the pages you actually visit first, then what you visited before", async () => {
    window.localStorage.setItem(
      "admin.recent-nav.v1",
      JSON.stringify(["/admin/payouts"]),
    );
    renderPalette({ pathname: "/admin/coupons" });
    const options = await screen.findAllByRole("option");
    await waitFor(() => expect(options[0].textContent).toContain("Coupons"));
    expect(options[1].textContent).toContain("Payouts");
  });

  it("says so when nothing matches, rather than showing an empty box", async () => {
    renderPalette();
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it("carries the waiting-application count into the results", async () => {
    renderPalette({ counts: { shops: 3 } });
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "shops" } });
    const option = screen.getAllByRole("option")[0];
    expect(option).toHaveTextContent("Shops");
    expect(option).toHaveTextContent(/3 applications waiting/);
  });
});
