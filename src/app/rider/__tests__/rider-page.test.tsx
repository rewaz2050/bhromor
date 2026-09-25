import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RiderPage from "../page";
import type { RiderJob } from "@/lib/db/riders";
import type { Order } from "@/lib/orders";

const state = vi.hoisted(() => ({
  jobs: [] as unknown[],
  isOnline: false,
}));

vi.mock("@/lib/use-rider", () => ({
  useRiderSession: () => ({
    rider: {
      id: "r1",
      name: "রফিক",
      phone: "01712345678",
      vehicle: "bike",
      zoneIds: ["z1"],
      status: "active",
      isOnline: state.isOnline,
      cashInHand: 0,
      ratingAvg: 0,
      ratingCount: 0,
    },
    email: "rider@example.com",
    status: "authed",
    error: null,
    refresh: vi.fn(async () => {}),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
  useRiderJobs: () => ({
    jobs: state.jobs,
    settlements: [],
    loading: false,
    error: null,
    refresh: vi.fn(async () => true),
    accept: vi.fn(),
    pickup: vi.fn(),
    reject: vi.fn(),
    deliver: vi.fn(),
    setOnline: vi.fn(async () => true),
    updateLocation: vi.fn(async () => true),
    settle: vi.fn(async () => true),
  }),
}));

const order = (over: Partial<Order>): Order =>
  ({
    id: "PS-20260918-0007",
    createdAt: Date.now() - 5 * 60_000,
    customer: { name: "সালমা", phone: "01711111111", area: "Hasan Nagar", address: "House 12" },
    zoneId: "z1",
    zoneName: "Town",
    etaLabel: "45–60 min",
    items: [{ name: "Saree", qty: 1, unitPrice: 120000 }],
    subtotal: 120000,
    deliveryCharge: 5000,
    total: 125000,
    payment: "cod",
    paymentStatus: "verified",
    status: "ready-for-pickup",
    timeline: [],
    ...over,
  }) as unknown as Order;

const job = (state: RiderJob["state"], o: Order, expiresAt = Date.now() + 60_000): RiderJob => ({
  id: `asg-${o.id}`,
  orderId: o.id,
  state,
  offeredAt: Date.now(),
  expiresAt,
  order: o,
});

beforeEach(() => {
  state.jobs = [];
  state.isOnline = false;
});
afterEach(() => cleanup());

describe("Rider Mobile Portal (/rider)", () => {
  it("renders rider header, online toggle, cash meter, and task sections", () => {
    render(<RiderPage />);

    expect(screen.getByText(/PROSANTI রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/হাতে জমা ক্যাশ/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড অর্ডার সমূহ/i)).toBeInTheDocument();
  });

  it("a COD job says how much cash to collect; a bKash job says the customer already paid (Batch H)", () => {
    state.isOnline = true;
    state.jobs = [
      job("accepted", order({ id: "PS-COD", payment: "cod" })),
      job(
        "accepted",
        order({ id: "PS-BKASH", payment: "bkash", paymentStatus: "verified", customer: { name: "রহিম", phone: "01722222222", area: "Ukilpara", note: "গেটে কল দিবেন" } }),
      ),
    ];
    render(<RiderPage />);
    const cash = screen.getAllByTestId("rider-cash");
    expect(cash[0]).toHaveTextContent(/ক্যাশ সংগ্রহ করতে হবে/);
    expect(cash[0]).toHaveTextContent("1,250");
    expect(cash[1]).toHaveTextContent(/bKash-এ পেমেন্ট হয়ে গেছে — কোনো টাকা নিবেন না/);
    expect(cash[1]).toHaveTextContent("৳০");
    // customer note surfaces on the card
    expect(screen.getByTestId("rider-note")).toHaveTextContent("গেটে কল দিবেন");
    // maps deep link from the address when there is no pin
    const maps = screen.getAllByTestId("rider-maps");
    expect(maps[0]).toHaveAttribute("href", expect.stringContaining("google.com/maps"));
    expect(maps[0].getAttribute("href")).toContain(encodeURIComponent("House 12, Hasan Nagar, Sunamganj"));
    // the pickup button is still the same label the rider knows
    expect(screen.getAllByText("পিকআপ কনফার্ম করুন")).toHaveLength(2);
  });

  it("uses the geo pin for the maps link when the order has one", () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({ lat: 25.0658, lng: 91.3951 }))];
    render(<RiderPage />);
    expect(screen.getByTestId("rider-maps")).toHaveAttribute("href", "https://www.google.com/maps?q=25.0658,91.3951");
    expect(screen.getByText("ডেলিভারি কোড দিন")).toBeInTheDocument();
  });

  it("an offer shows a live countdown to its expiry next to Accept", () => {
    state.isOnline = true;
    state.jobs = [job("offered", order({}), Date.now() + 45_000)];
    render(<RiderPage />);
    const countdown = screen.getByTestId("rider-offer-countdown");
    expect(countdown).toHaveTextContent(/একসেপ্ট করার সময় বাকি/);
    expect(countdown).toHaveTextContent(/4[0-5] সেকেন্ড/);
    expect(screen.getByText("অর্ডার একসেপ্ট করুন")).toBeInTheDocument();
  });

  it("a return pickup never asks the rider for money", () => {
    state.isOnline = true;
    state.jobs = [job("accepted", order({ isReturn: true, payment: "cod" }))];
    render(<RiderPage />);
    expect(screen.getByTestId("rider-cash")).toHaveTextContent(/রিটার্ন — কোনো টাকা নিবেন না/);
  });
  it("shows the shared-request explanation and shop pickup details without customer call/map actions", () => {
    state.isOnline = true;
    state.jobs = [{
      ...job("offered", order({})),
      pickupShop: { name: "Town Shop", address: "Market Road", phone: "01812345678" },
    }];
    render(<RiderPage />);
    expect(screen.getByText(/যিনি আগে গ্রহণ করবেন/)).toBeInTheDocument();
    expect(screen.getByText(/পিকআপের দোকান: Town Shop/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "দোকানে কল" })).toHaveAttribute("href", "tel:01812345678");
    expect(screen.queryByTestId("rider-maps")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "কল দিন" })).not.toBeInTheDocument();
  });

  it("keeps accepted work visible when the rider goes offline", () => {
    state.isOnline = false;
    state.jobs = [job("accepted", order({}))];
    render(<RiderPage />);
    expect(screen.getByText("পিকআপ কনফার্ম করুন")).toBeInTheDocument();
    expect(screen.getByText("আমার রাইডার প্রোফাইল")).toBeInTheDocument();
  });

});
