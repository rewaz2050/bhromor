import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminOrdersPage from "../orders/page";

const state = vi.hoisted(() => ({ loading: false, error: null as string | null, retry: vi.fn(), dismiss: vi.fn() }));
vi.mock("@/lib/use-orders", () => ({
  useOrders: () => ({
    orders: [], live: true, loading: state.loading, error: state.error,
    clearError: state.dismiss, reset: state.retry, hasMore: false,
    loadingMore: false, loadMore: vi.fn(), advance: vi.fn(), cancel: vi.fn(),
  }),
}));
vi.mock("@/components/admin/wa-draft-panel", () => ({ default: () => null }));
beforeEach(() => { state.loading = false; state.error = null; vi.clearAllMocks(); });
afterEach(cleanup);

it("keeps the search input mounted and focused while a new query loads", () => {
  const { rerender } = render(<AdminOrdersPage />);
  const search = screen.getByRole("searchbox", { name: "Search orders" });
  fireEvent.change(search, { target: { value: "customer" } });
  search.focus();
  state.loading = true;
  rerender(<AdminOrdersPage />);
  expect(screen.getByRole("searchbox", { name: "Search orders" })).toBe(search);
  expect(document.activeElement).toBe(search);
  expect(search).toHaveValue("customer");
  expect(screen.getByRole("status", { name: "Loading orders" })).toBeInTheDocument();
  expect(screen.queryByText("No orders found")).not.toBeInTheDocument();
  state.loading = false;
  rerender(<AdminOrdersPage />);
  expect(document.activeElement).toBe(search);
  expect(screen.queryByRole("status", { name: "Loading orders" })).not.toBeInTheDocument();
});

it("renders actionable first-read errors instead of an endless skeleton", () => {
  state.error = "Offline";
  render(<AdminOrdersPage />);
  expect(screen.getByRole("alert")).toHaveTextContent("Orders: Offline");
  expect(screen.queryByRole("status", { name: "Loading orders" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(state.retry).toHaveBeenCalledTimes(1);
  expect(state.dismiss).toHaveBeenCalledTimes(1);
});
