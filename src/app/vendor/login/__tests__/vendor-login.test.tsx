/**
 * Vendor sign-in after apply = sign up (2026-09-26): no "Create account"
 * tab — the shop application sets the password — and a pending applicant
 * who signs in sees the status card instead of a bounce.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
}));

const session = vi.hoisted(() => ({
  value: {
    status: "guest" as "checking" | "authed" | "guest",
    error: null as string | null,
    denyReason: null as "none" | "pending" | "suspended" | "rejected" | null,
    refresh: vi.fn(async () => undefined),
    signIn: vi.fn(async () => null as string | null),
    signOut: vi.fn(async () => undefined),
  },
}));
vi.mock("@/lib/use-vendor", () => ({
  useVendorSession: () => session.value,
}));
const poll = vi.hoisted(() => ({ calls: [] as { intervalMs: number; enabled: boolean }[] }));
vi.mock("@/lib/use-poll", () => ({
  usePoll: (_fn: unknown, intervalMs: number, enabled: boolean) => {
    poll.calls.push({ intervalMs, enabled });
  },
}));

import VendorLoginPage from "../page";

beforeEach(() => {
  nav.replace.mockReset();
  poll.calls = [];
  session.value = {
    status: "guest",
    error: null,
    denyReason: null,
    refresh: vi.fn(async () => undefined),
    signIn: vi.fn(async () => null),
    signOut: vi.fn(async () => undefined),
  };
});

describe("Vendor login page (/vendor/login)", () => {
  it("is sign-in only and links to the shop application", () => {
    render(<VendorLoginPage />);

    expect(screen.getByRole("heading", { name: "Vendor dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /apply to sell/i })).toHaveAttribute("href", "/shops/apply");
  });

  it("signs in with the application's email and password", async () => {
    render(<VendorLoginPage />);

    fireEvent.change(screen.getByLabelText(/^Email or mobile number/), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(session.value.signIn).toHaveBeenCalledWith("shop@example.com", "secret1"),
    );
  });

  it("signs in with a mobile number by mapping it to the phone-login address (round 4)", async () => {
    render(<VendorLoginPage />);

    fireEvent.change(screen.getByLabelText(/^Email or mobile number/), { target: { value: "+880 1712-345678" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(session.value.signIn).toHaveBeenCalledWith("01712345678@phone.prosanti.app", "secret1"),
    );
  });

  it("shows the rejection reason and a re-apply link for a rejected shop (round 4)", () => {
    session.value.error = "Your shop application was not approved this time. Reason: phone never answers — fix the details and apply again with this same login.";
    session.value.denyReason = "rejected";
    render(<VendorLoginPage />);

    expect(screen.getByRole("heading", { name: /fix the details and apply again/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/phone never answers/);
    expect(screen.getByRole("link", { name: /re-apply/i })).toHaveAttribute("href", "/shops/apply");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows the awaiting-approval card for a pending shop", () => {
    session.value.error = "Your shop application is awaiting PROSANTI's approval";
    session.value.denyReason = "pending";
    render(<VendorLoginPage />);

    expect(screen.getByRole("heading", { name: /awaiting PROSANTI's approval/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/awaiting/i);
    expect(screen.queryByLabelText(/^Email or mobile number/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(session.value.refresh).toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("points a login without a shop at the application", () => {
    session.value.error = "This account has no vendor access.";
    session.value.denyReason = "none";
    render(<VendorLoginPage />);

    expect(screen.getByRole("link", { name: /apply to sell/i })).toHaveAttribute("href", "/shops/apply");
  });

  it("sends an approved vendor to the dashboard", () => {
    session.value.status = "authed";
    render(<VendorLoginPage />);
    expect(nav.replace).toHaveBeenCalledWith("/vendor");
  });
});

describe("Vendor Login Page — pending auto re-check (apply = sign up)", () => {
  it("re-checks the session every 30 s only while the applicant is pending", () => {
    session.value = { ...session.value, error: "Waiting for approval.", denyReason: "pending" };
    render(<VendorLoginPage />);
    expect(poll.calls.at(-1)).toEqual({ intervalMs: 30_000, enabled: true });
    expect(screen.getByText(/re-checks every 30 seconds/)).toBeInTheDocument();
  });

  it("does not poll for a plain guest", () => {
    render(<VendorLoginPage />);
    expect(poll.calls.at(-1)?.enabled).toBe(false);
  });

  it("has a show/hide password toggle and an in-app reset request", () => {
    render(<VendorLoginPage />);
    const password = screen.getByLabelText(/Password/);
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    expect(screen.getByText("Request a password reset")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
  });
  it("focuses and describes a bad identifier before attempting sign-in", () => {
    render(<VendorLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const input = screen.getByLabelText("Email or mobile number");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/valid email address/);
    expect(session.value.signIn).not.toHaveBeenCalled();
  });

  it("recovers from a rejected sign-in promise without leaving controls busy", async () => {
    session.value.signIn.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<VendorLoginPage />);
    fireEvent.change(screen.getByLabelText("Email or mobile number"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "qa-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not sign in"));
    // Focus moves in an effect that runs after the alert paints, so asserting it
    // synchronously raced the render (it failed on a loaded CI runner).
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByLabelText("Password")).toHaveValue("qa-password");
  });

});
