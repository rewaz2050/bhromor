import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
}));

const session = vi.hoisted(() => ({
  value: {
    status: "guest" as "checking" | "authed" | "guest",
    error: null as string | null,
    denyReason: null as "none" | "pending" | "suspended" | null,
    refresh: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/use-rider", () => ({
  useRiderSession: () => session.value,
}));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => null,
}));

import RiderLoginPage from "../page";

beforeEach(() => {
  nav.replace.mockReset();
  session.value = {
    status: "guest",
    error: null,
    denyReason: null,
    refresh: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
});

describe("Rider Login Page (/rider/login)", () => {
  it("renders rider login portal elements", () => {
    render(<RiderLoginPage />);

    expect(screen.getByText(/PROSANTI রাইডার লগইন/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ইমেইল অ্যাড্রেস/)).toBeInTheDocument();
    expect(screen.getByLabelText(/পাসওয়ার্ড/)).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: /লগইন করুন/ })).toBeInTheDocument();
  });

  it("is sign-in only: applying is the sign-up (apply = sign up, 2026-09-26)", () => {
    render(<RiderLoginPage />);

    expect(screen.queryByRole("button", { name: /নতুন অ্যাকাউন্ট/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /এখানে আবেদন করুন/ })).toHaveAttribute("href", "/rider/apply");
  });

  it("shows the awaiting-approval card instead of the form for a pending applicant", () => {
    session.value.error = "আপনার রাইডার আবেদন এখনো অনুমোদনের অপেক্ষায় আছে";
    session.value.denyReason = "pending";
    render(<RiderLoginPage />);

    expect(screen.getByRole("heading", { name: /অনুমোদনের অপেক্ষায়/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/অনুমোদনের অপেক্ষায় আছে/);
    expect(screen.queryByRole("button", { name: /^লগইন করুন$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /সাইন আউট/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /আবার দেখুন/ })).toBeInTheDocument();
    // No bounce to /rider while the application is pending.
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("points a login without a rider profile at the application form", () => {
    session.value.error = "This account has no rider access.";
    session.value.denyReason = "none";
    render(<RiderLoginPage />);

    expect(screen.getByRole("link", { name: /রাইডার আবেদন ফর্ম/ })).toHaveAttribute("href", "/rider/apply");
  });

  it("sends an approved rider to the app", () => {
    session.value.status = "authed";
    render(<RiderLoginPage />);
    expect(nav.replace).toHaveBeenCalledWith("/rider");
  });
});
