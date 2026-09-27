import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminDashboard from "../page";

const state = vi.hoisted(() => ({
  loading: true,
  applications: { shops: 0, riders: 0, resets: 0, total: 0 },
}));

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

vi.mock("@/lib/use-applications-pending", () => ({
  useApplicationsPending: () => state.applications,
}));

afterEach(() => {
  cleanup();
  state.loading = true;
  state.applications = { shops: 0, riders: 0, resets: 0, total: 0 };
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

describe("admin dashboard — pending applications (apply = sign up)", () => {
  it("stays silent when nothing is waiting", () => {
    state.loading = false;
    render(<AdminDashboard />);
    expect(screen.queryByText(/Waiting for you/)).not.toBeInTheDocument();
  });

  it("shows the banner with per-queue links when applications are waiting", () => {
    state.loading = false;
    state.applications = { shops: 2, riders: 1, resets: 0, total: 3 };
    render(<AdminDashboard />);
    const banner = screen.getByText(/Waiting for you/);
    expect(banner).toHaveTextContent(/2 shop applications · 1 rider application\b/);
    expect(screen.getByRole("link", { name: /^Shops/ })).toHaveAttribute("href", "/admin/shops");
    expect(screen.getByRole("link", { name: /^Riders/ })).toHaveAttribute("href", "/admin/riders");
    expect(screen.queryByRole("link", { name: /^Access requests/ })).not.toBeInTheDocument();
  });

  it("links only the queue that has something in it — including password resets", () => {
    state.loading = false;
    state.applications = { shops: 0, riders: 0, resets: 1, total: 1 };
    render(<AdminDashboard />);
    expect(screen.getByText(/1 password reset request\b/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Shops/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Riders/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Access requests/ })).toHaveAttribute("href", "/admin/access");
  });
});
