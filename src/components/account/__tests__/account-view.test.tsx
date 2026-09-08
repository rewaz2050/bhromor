import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import AccountView from "../account-view";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  verify: vi.fn(),
  signOut: vi.fn(),
  customer: {
    client: null as SupabaseClient | null,
    session: null as Session | null,
    loading: false,
  },
}));
vi.mock("../customer-provider", () => ({ useCustomer: () => mocks.customer }));
beforeEach(() => {
  mocks.customer = {
    client: {
      auth: {
        signInWithOtp: mocks.send,
        verifyOtp: mocks.verify,
        signOut: mocks.signOut,
      },
    } as unknown as SupabaseClient,
    session: null,
    loading: false,
  };
  mocks.send.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Email OTP account", () => {
  it("keeps guest shopping available without Supabase configuration", () => {
    mocks.customer.client = null;
    render(<AccountView />);
    expect(
      screen.getByText(/No account is created in this preview/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View guest wishlist/ }),
    ).toHaveAttribute("href", "/wishlist");
  });
  it("sends a code, enforces a resend cooldown and verifies against the sent-to address", async () => {
    render(<AccountView />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "shopper@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Email code")).toBeInTheDocument(),
    );
    expect(mocks.send).toHaveBeenCalledWith({
      email: "shopper@example.com",
      options: { shouldCreateUser: true },
    });
    expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & sign in" }));
    await waitFor(() =>
      expect(mocks.verify).toHaveBeenCalledWith({
        email: "shopper@example.com",
        token: "123456",
        type: "email",
      }),
    );
  });
  it("shows invalid/expired OTP errors without faking authentication", async () => {
    mocks.verify.mockResolvedValue({ error: new Error("expired") });
    render(<AccountView />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "shopper@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Email code")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Email code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & sign in" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("invalid or expired"),
    );
    expect(screen.queryByText("Signed in")).not.toBeInTheDocument();
  });
  it("signs out locally and surfaces a sign-out failure", async () => {
    mocks.customer.session = {
      user: { id: "a", email: "shopper@example.com" },
    } as Session;
    mocks.signOut.mockResolvedValue({ error: new Error("offline") });
    render(<AccountView />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out on this device" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Sign out failed"),
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
