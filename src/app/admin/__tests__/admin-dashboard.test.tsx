import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminDashboard from "../page";

const state = vi.hoisted(() => ({ loading: true }));

vi.mock("@/lib/use-orders", () => ({
  useOrders: () => ({
    orders: [],
    loading: state.loading,
    error: null,
    clearError: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/use-catalog", () => ({
  useCatalog: () => ({
    products: [],
    error: null,
    clearError: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/use-settings", () => ({
  useSettings: () => ({
    settings: { lowStockThreshold: 5 },
    error: null,
    clearError: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/use-now", () => ({
  useNow: () => Date.now(),
}));

afterEach(() => {
  cleanup();
  state.loading = true;
});

describe("admin dashboard loading state", () => {
  it("shows the skeleton — never flashing zero KPIs — while orders load", () => {
    render(<AdminDashboard />);
    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Key figures")).not.toBeInTheDocument();
  });

  it("renders the KPI figures once orders arrive", () => {
    state.loading = false;
    render(<AdminDashboard />);
    expect(screen.getByLabelText("Key figures")).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Loading dashboard" }),
    ).not.toBeInTheDocument();
  });
});
