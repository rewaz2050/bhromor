import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { CustomerInfo } from "@/lib/customer-session";
import AccountView from "../account-view";

const mocks = vi.hoisted(() => ({
  customer: null as CustomerInfo | null,
  mode: "demo" as "live" | "demo" | null,
  checked: true,
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  demoSignup: vi.fn(),
  demoLogin: vi.fn(),
}));

vi.mock("@/lib/use-customer", () => ({
  useCustomer: () => ({
    customer: mocks.customer,
    mode: mocks.mode,
    checked: mocks.checked,
    refresh: mocks.refresh,
    signOut: mocks.signOut,
  }),
}));
vi.mock("@/lib/customer-session", () => ({
  demoSignup: mocks.demoSignup,
  demoLogin: mocks.demoLogin,
}));

beforeEach(() => {
  mocks.customer = null;
  mocks.mode = "demo";
  mocks.checked = true;
  mocks.refresh.mockClear();
  mocks.signOut.mockClear();
  mocks.demoSignup.mockReset().mockResolvedValue({ ok: true });
  mocks.demoLogin.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe("AccountView — no-verification signup (instant login)", () => {
  it("signs up and is logged in immediately — no OTP/email code anywhere", async () => {
    render(<AccountView />);
    fireEvent.change(screen.getByLabelText("আপনার নাম"), {
      target: { value: "রহিম উদ্দিন" },
    });
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), {
      target: { value: "01712345678" },
    });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
      target: { value: "secret123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "সাইন আপ করুন — সাথে সাথে লগ ইন" }),
    );
    await waitFor(() =>
      expect(mocks.demoSignup).toHaveBeenCalledWith({
        name: "রহিম উদ্দিন",
        phone: "01712345678",
        password: "secret123",
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(
      await screen.findByText(/অ্যাকাউন্ট খোলা হয়েছে — আপনি এখনই লগ ইন/),
    ).toBeInTheDocument();
    // No verification UI exists:
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /code/i })).not.toBeInTheDocument();
  });

  it("surfaces signup errors without faking a session", async () => {
    mocks.demoSignup.mockResolvedValue({
      ok: false,
      error: "এই নম্বরে অ্যাকাউন্ট আগেই আছে — লগ ইন করুন।",
    });
    render(<AccountView />);
    fireEvent.change(screen.getByLabelText("আপনার নাম"), {
      target: { value: "রহিম উদ্দিন" },
    });
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), {
      target: { value: "01712345678" },
    });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
      target: { value: "secret123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "সাইন আপ করুন — সাথে সাথে লগ ইন" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "এই নম্বরে অ্যাকাউন্ট আগেই আছে",
      ),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("logs in with phone + password via the login tab", async () => {
    render(<AccountView />);
    fireEvent.click(screen.getByRole("tab", { name: "লগ ইন" }));
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), {
      target: { value: "01712345678" },
    });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "লগ ইন করুন" }));
    await waitFor(() =>
      expect(mocks.demoLogin).toHaveBeenCalledWith({
        phone: "01712345678",
        password: "secret123",
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("signed-in view shows the account and signs out", async () => {
    mocks.customer = { id: "c1", name: "রহিম উদ্দিন", phone: "01712345678" };
    render(<AccountView />);
    expect(screen.getByText("রহিম উদ্দিন")).toBeInTheDocument();
    expect(screen.getByText(/01712345678/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "এই ডিভাইস থেকে লগ আউট" }),
    );
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
  });

  it("join teaser: the smart card explains account requirement without verification", () => {
    render(<AccountView />);
    expect(screen.getByTestId("loyalty-stamp-card")).toHaveTextContent(
      "স্মার্ট কার্ড",
    );
    expect(
      screen.getByText(/কোনো ভেরিফিকেশন লাগে না/),
    ).toBeInTheDocument();
  });
});
