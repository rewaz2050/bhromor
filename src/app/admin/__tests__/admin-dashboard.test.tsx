import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { makePlacedOrder, type Order, type OrderStatus } from "@/lib/orders";
import AdminDashboard from "../page";

const NOW = Date.now();

/** A real order record (the checkout factory), N minutes old, in `status`. */
const order = (
  id: string,
  status: OrderStatus,
  minutesAgo: number,
  over: Partial<Order> = {},
): Order => ({
  ...makePlacedOrder({
    id,
    createdAt: NOW - minutesAgo * 60_000,
    customer: { name: "Rahat Ahmed", phone: "01712345678", area: "Boropara" },
    zone: { id: "z1", name: "Zone A", etaLabel: "40–50 min", charge: 6000 },
    items: [
      {
        product: { id: "p1", slug: "panjabi", sku: "SKU-1", name: "Panjabi", price: 250000 },
        image: "/img.jpg",
        variant: "M",
        qty: 1,
      },
    ],
  }),
  status,
  ...over,
});

const state = vi.hoisted(() => ({
  loading: true,
  orders: [] as Order[],
  reviews: [] as { id: string; status: string; productId: string }[],
  applications: { shops: 0, riders: 0, resets: 0, total: 0 },
}));

vi.mock("@/lib/use-orders", () => ({
  useOrders: () => ({
    orders: state.orders,
    loading: state.loading,
    error: null,
    clearError: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/use-reviews", () => ({
  useReviews: () => ({ reviews: state.reviews }),
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
  state.orders = [];
  state.reviews = [];
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

describe("admin dashboard — today's work", () => {
  it("says every queue is clear instead of listing zeros", () => {
    state.loading = false;
    render(<AdminDashboard />);
    const panel = screen.getByLabelText("Today's work");
    expect(panel).toHaveTextContent(/Nothing is waiting/i);
    expect(panel).toHaveTextContent(/every queue is clear/i);
  });

  it("lists what is waiting, oldest first, each row a door to that queue", () => {
    state.loading = false;
    state.orders = [
      order("4821", "pending", 4),
      order("4822", "preparing", 6),
      order("4820", "courier-assigned", 41),
    ];
    render(<AdminDashboard />);
    const panel = screen.getByLabelText("Today's work");
    // The parcel past its 30-minute SLA comes above the two fresh orders.
    expect(panel).toHaveTextContent(/Parcels waiting for a rider/);
    const rows = screen
      .getAllByRole("link")
      .filter((link) => panel.contains(link));
    expect(rows[0]).toHaveAttribute("href", "/admin/deliveries");
    expect(rows[1]).toHaveAttribute("href", "/admin/orders?status=action");
    expect(panel).toHaveTextContent(/oldest waiting 41 min/);
  });

  it("counts bKash/Nagad waiting for verification as work, in its own tone", () => {
    state.loading = false;
    state.orders = [
      order("4823", "confirmed", 6, {
        payment: "bkash",
        paymentStatus: "pending_verification",
      }),
    ];
    render(<AdminDashboard />);
    const panel = screen.getByLabelText("Today's work");
    expect(panel).toHaveTextContent(/bKash \/ Nagad to verify/);
    expect(panel).toHaveTextContent(/TrxID/);
  });

  it("counts reviews waiting for moderation — pending and flagged", () => {
    state.loading = false;
    state.reviews = [
      { id: "r1", status: "pending", productId: "p1" },
      { id: "r2", status: "flagged", productId: "p1" },
      { id: "r3", status: "approved", productId: "p1" },
    ];
    render(<AdminDashboard />);
    const panel = screen.getByLabelText("Today's work");
    expect(panel).toHaveTextContent(/Reviews to moderate/);
    expect(screen.getByRole("link", { name: /Reviews to moderate/ })).toHaveAttribute(
      "href",
      "/admin/reviews",
    );
  });
});
