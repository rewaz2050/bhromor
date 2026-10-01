import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RiderPage from "../page";
import type { RiderJob } from "@/lib/db/riders";
import type { Order } from "@/lib/orders";

const state = vi.hoisted(() => ({
  jobs: [] as unknown[],
  isOnline: false,
  /** 202609300001 — the tip wallet shown by /api/rider/stats. */
  earnings: 0,
  today: undefined as { todayDeliveries: number; todayEarned?: number } | undefined,
  deliver: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
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
    denyReason: null,
    refresh: vi.fn(async () => {}),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  useRiderStats: () => ({
    stats: {
      totalDeliveries: 41,
      weekDeliveries: 9,
      ratingAvg: 4.8,
      ratingCount: 12,
      earningsBalance: state.earnings,
      ...state.today,
    },
    loading: false,
    refresh: vi.fn(async () => {}),
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
    deliver: (...args: unknown[]) => state.deliver(...args),
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
  state.earnings = 0;
  state.today = undefined;
  state.deliver.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Rider Mobile Portal (/rider)", () => {
  it("renders rider header, online toggle, cash meter, and task sections", () => {
    render(<RiderPage />);

    expect(screen.getByText(/PROSANTI রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/হাতে জমা ক্যাশ/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড অর্ডার সমূহ/i)).toBeInTheDocument();

    // Scoreboard (202609250008): lifetime + 7-day + own rating from /api/rider/stats.
    expect(screen.getByText("মোট ডেলিভারি")).toBeInTheDocument();
    expect(screen.getByText("৭ দিনে")).toBeInTheDocument();
    expect(screen.getByText("⭐ 4.8 (12)")).toBeInTheDocument();
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

  it("shows today's deliveries + earnings only when the figures exist, and a stepper on the job", () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({}))];
    const { unmount } = render(<RiderPage />);
    expect(screen.queryByTestId("rider-today")).not.toBeInTheDocument();
    expect(screen.getByTestId("trip-stepper").querySelector('[data-step="picked_up"]')).toHaveAttribute("data-status", "active");
    unmount();
    state.today = { todayDeliveries: 3, todayEarned: 21000 };
    render(<RiderPage />);
    const today = screen.getByTestId("rider-today");
    expect(today).toHaveTextContent("3 ডেলিভারি");
    expect(today).toHaveTextContent("210");
    expect(today).toHaveAttribute("href", "/rider/earnings");
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
    // The profile + shift forms live on the Profile tab now, not the home screen.
    expect(screen.queryByText("আমার রাইডার প্রোফাইল")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Shift settings")).not.toBeInTheDocument();
  });

  it("shows the tip wallet as earnings, separate from COD cash-in-hand (202609300001)", () => {
    state.earnings = 1500; // ৳15
    render(<RiderPage />);
    const wallet = screen.getByTestId("rider-earnings");
    expect(wallet).toHaveTextContent(/আপনার আয়/);
    expect(wallet).toHaveTextContent("৳15");
    expect(wallet).toHaveTextContent(/হাতের ক্যাশ নয়/);
  });

  it("keeps the tip wallet hidden while it is empty", () => {
    render(<RiderPage />);
    expect(screen.queryByTestId("rider-earnings")).not.toBeInTheDocument();
  });

  it("links to the full earnings statement (202609300002)", () => {
    render(<RiderPage />);
    expect(screen.getByTestId("rider-earnings-link")).toHaveAttribute(
      "href",
      "/rider/earnings",
    );
  });

  it("surfaces a failed-attempt refusal inline instead of dropping it (audit B7)", async () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({}))];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Please provide a reason (at least 5 chars)." }),
      })),
    );
    render(<RiderPage />);
    fireEvent.click(screen.getByText(/Report failed attempt/i));
    const reason = screen.getByLabelText("Failed attempt reason");
    fireEvent.change(reason, { target: { value: "phone off" } });
    fireEvent.click(screen.getByText("Submit failed"));
    expect(await screen.findByText(/at least 5 chars/i)).toBeInTheDocument();
  });

  it("will not submit a failed attempt shorter than five characters", () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({}))];
    render(<RiderPage />);
    fireEvent.click(screen.getByText(/Report failed attempt/i));
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), {
      target: { value: "abc" },
    });
    expect(screen.getByText("Submit failed")).toBeDisabled();
  });

  // 202610010001 (audit N5) — a customer-side failure exists only once the
  // parcel is in the rider's hands, and a closed job leaves the rider's list.
  it("offers 'report failed attempt' only after pickup", () => {
    state.isOnline = true;
    state.jobs = [job("accepted", order({}))];
    render(<RiderPage />);
    expect(screen.queryByText(/Report failed attempt/i)).not.toBeInTheDocument();
    cleanup();
    state.jobs = [job("picked_up", order({}))];
    render(<RiderPage />);
    expect(screen.getByText(/Report failed attempt/i)).toBeInTheDocument();
  });

  it("drops a job that ended as a final failed attempt from the active list", () => {
    state.isOnline = true;
    state.jobs = [job("failed", order({ id: "PS-FAILED-1" }))];
    render(<RiderPage />);
    expect(screen.queryByText(/PS-FAILED-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Report failed attempt/i)).not.toBeInTheDocument();
  });

  it("tells the rider whether the attempt was the last one", async () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({}))];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ failed: true, final: true, attempts: 2, maxAttempts: 2 }),
      })),
    );
    render(<RiderPage />);
    fireEvent.click(screen.getByText(/Report failed attempt/i));
    fireEvent.change(screen.getByLabelText("Failed attempt reason"), {
      target: { value: "address does not exist" },
    });
    fireEvent.click(screen.getByText("Submit failed"));
    expect(await screen.findByText(/পার্সেল দোকানে ফেরত দিন/)).toBeInTheDocument();
  });

  it("delivery needs a proof photo; 'can't take a photo' asks for a reason and sends it (audit N9)", async () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({}))];
    render(<RiderPage />);
    fireEvent.click(screen.getByText(/ডেলিভারি কোড দিন/));
    expect(screen.getByText(/ডেলিভারির ছবি বাধ্যতামূলক/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/ছবি ছাড়া ডেলিভারির কারণ/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "4821" } });

    fireEvent.click(screen.getByText("ছবি তুলতে পারছি না"));
    fireEvent.change(screen.getByLabelText(/ছবি ছাড়া ডেলিভারির কারণ/), {
      target: { value: "ক্যামেরা কাজ করছে না" },
    });
    fireEvent.click(screen.getByText("ডেলিভারি সম্পন্ন করুন"));

    await vi.waitFor(() => expect(state.deliver).toHaveBeenCalled());
    expect(state.deliver).toHaveBeenCalledWith(
      "asg-PS-20260918-0007",
      "4821",
      null,
      "ক্যামেরা কাজ করছে না",
    );
  });

  it("with no photo and no reason the rider app sends neither (the server then refuses)", async () => {
    state.isOnline = true;
    state.jobs = [job("picked_up", order({}))];
    render(<RiderPage />);
    fireEvent.click(screen.getByText(/ডেলিভারি কোড দিন/));
    fireEvent.change(screen.getByPlaceholderText("• • • •"), { target: { value: "4821" } });
    fireEvent.click(screen.getByText("ডেলিভারি সম্পন্ন করুন"));
    await vi.waitFor(() => expect(state.deliver).toHaveBeenCalled());
    expect(state.deliver).toHaveBeenCalledWith("asg-PS-20260918-0007", "4821", null, null);
  });
});
