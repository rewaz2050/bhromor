import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RiderPage from "../page";

vi.mock("@/lib/use-rider", () => ({
  useRiderSession: () => ({
    rider: {
      id: "r1",
      name: "রফিক",
      phone: "01712345678",
      vehicle: "bike",
      zoneIds: ["z1"],
      status: "active",
      isOnline: false,
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
    jobs: [],
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

describe("Rider Mobile Portal (/rider)", () => {
  it("renders rider header, online toggle, cash meter, and task sections", () => {
    render(<RiderPage />);

    expect(screen.getByText(/PROSANTI রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/হাতে জমা ক্যাশ/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড অর্ডার সমূহ/i)).toBeInTheDocument();
  });
});
