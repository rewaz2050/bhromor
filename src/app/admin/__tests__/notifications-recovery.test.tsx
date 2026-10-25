import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Notif } from "@/lib/notification-store";
const state = vi.hoisted(() => ({ notifs: [] as Notif[], checked: true, loading: false, error: null as string | null, connectionError: null as string | null, reset: vi.fn(), retryConnection: vi.fn(), read: vi.fn(), readAll: vi.fn() }));
vi.mock("@/lib/use-notifications", () => ({ useNotifications: () => state }));
vi.mock("@/lib/use-orders", () => ({ useOrders: () => ({ orders: [] }) }));
vi.mock("@/lib/use-catalog", () => ({ useCatalog: () => ({ products: [] }) }));
vi.mock("@/lib/use-settings", () => ({ useSettings: () => ({ settings: { lowStockThreshold: 3 } }) }));
vi.mock("@/lib/use-reviews", () => ({ useReviews: () => ({ reviews: [] }) }));
vi.mock("@/components/admin/push-setup", () => ({ default: () => null }));
import Page from "../notifications/page";
beforeEach(() => { state.notifs = []; state.checked = true; state.loading = false; state.error = null; state.connectionError = null; vi.clearAllMocks(); });
afterEach(cleanup);
it("shows loading instead of an empty inbox while the session is checked", () => {
  state.checked = false; render(<Page />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your inbox");
  expect(screen.queryByText("Nothing here")).not.toBeInTheDocument();
});
it("does not spin forever or claim no notices after an initial request failure", () => {
  state.loading = true; state.error = "Request failed"; render(<Page />);
  expect(screen.getByText("Inbox could not be verified")).toBeInTheDocument();
  expect(screen.queryByText("Loading your inbox…")).not.toBeInTheDocument();
  expect(screen.queryByText("Nothing here")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Unread 0" }));
  expect(screen.queryByText("All caught up")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.reset).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Unread 0" })).toHaveAttribute("aria-pressed", "true");
});
it("retries the session probe, not the inbox request, for a connection error", () => {
  state.connectionError = "Session unavailable"; render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.retryConnection).toHaveBeenCalledOnce(); expect(state.reset).not.toHaveBeenCalled();
});
it("retains existing notices with a warning after a failed update", () => {
  state.notifs = [{ id: "qa", kind: "system", title: "Retained notice", body: "Details", at: Date.now(), read: false }]; state.error = "Update failed";
  render(<Page />);
  expect(screen.getByText("Retained notice")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("may not reflect the latest updates");
  expect(screen.queryByText("Inbox could not be verified")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark read" })).toHaveClass("min-h-11");
});
it("still shows genuine empty and caught-up states after a successful check", () => {
  render(<Page />); expect(screen.getByText("Nothing here")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Unread 0" }));
  expect(screen.getByText("All caught up")).toBeInTheDocument();
});
