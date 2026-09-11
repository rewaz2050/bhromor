/**
 * Account panel in LIVE mode — the "signup finishes but the page sits there"
 * regression. The view must flip to the signed-in dashboard the moment the
 * session API confirms the login; duplicate-phone signup must hand the
 * customer to the login tab.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccountView from "../account-view";
import {
  __resetLiveAuthForTests,
} from "@/lib/customer-session";

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

let routes: Record<string, Handler>;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  __resetLiveAuthForTests();
  routes = {};
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return jsonResponse({ error: "not mocked" }, 404);
    return routes[key](url, init);
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

/** Signed-out live session probe — the panel mounts in form mode. */
const signedOutLive = () => {
  routes["/api/account/me"] = async () => jsonResponse({ customer: null }, 401);
};

describe("AccountView — live session flip (no reload needed)", () => {
  it("login succeeds → panel switches to the signed-in dashboard", async () => {
    signedOutLive();
    const customer = { id: "c1", name: "রহিম উদ্দিন", phone: "01712345678" };
    routes["/api/account/login"] = async () => {
      // Cookie set server-side — the refresh probe now sees the session.
      routes["/api/account/me"] = async () => jsonResponse({ customer });
      return jsonResponse({ customer });
    };

    render(<AccountView />);
    await screen.findByRole("tab", { name: "লগ ইন" });
    fireEvent.click(screen.getByRole("tab", { name: "লগ ইন" }));
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), {
      target: { value: "01712345678" },
    });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "লগ ইন করুন" }));

    // The dashboard shows up in place — no reload, no stuck form.
    expect(await screen.findByText("রহিম উদ্দিন", { exact: false })).toBeInTheDocument();
    expect(
      await screen.findByText(/আপনার অ্যাকাউন্ট ড্যাশবোর্ডে আছেন/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "লগ ইন করুন" })).not.toBeInTheDocument();
  });

  it("signup → instantly signed in, dashboard replaces the form (no OTP, no stuck page)", async () => {
    signedOutLive();
    const customer = { id: "c2", name: "করিম মিয়া", phone: "01812345678" };
    routes["/api/account/signup"] = async () => {
      routes["/api/account/me"] = async () => jsonResponse({ customer });
      return jsonResponse({ customer }, 201);
    };

    render(<AccountView />);
    await screen.findByLabelText("আপনার নাম");
    fireEvent.change(screen.getByLabelText("আপনার নাম"), {
      target: { value: "করিম মিয়া" },
    });
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), {
      target: { value: "01812345678" },
    });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
      target: { value: "secret123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "সাইন আপ করুন — সাথে সাথে লগ ইন" }),
    );

    expect(await screen.findByText(/অ্যাকাউন্ট খোলা হয়েছে — আপনি এখনই লগ ইন/)).toBeInTheDocument();
    expect(screen.getByText("লগ ইন করা আছে — আপনার ড্যাশবোর্ড")).toBeInTheDocument();
    expect(screen.getByText("করিম মিয়া")).toBeInTheDocument();
    // No separate login step is demanded: the signup form is gone.
    expect(
      screen.queryByRole("button", { name: "সাইন আপ করুন — সাথে সাথে লগ ইন" }),
    ).not.toBeInTheDocument();
  });

  it("duplicate phone at signup → the login tab becomes active with the error", async () => {
    signedOutLive();
    routes["/api/account/signup"] = async () =>
      jsonResponse(
        { error: "এই নম্বরে অ্যাকাউন্ট আগেই আছে — লগ ইন করুন।" },
        409,
      );

    render(<AccountView />);
    await screen.findByLabelText("আপনার নাম");
    fireEvent.change(screen.getByLabelText("আপনার নাম"), {
      target: { value: "রহিম" },
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
      expect(screen.getByRole("alert")).toHaveTextContent("এই নম্বরে অ্যাকাউন্ট আগেই আছে"),
    );
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "লগ ইন" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  it("live error responses stay on-form — the password field is the only failure surface", async () => {
    signedOutLive();
    routes["/api/account/login"] = async () =>
      jsonResponse({ error: "নম্বর বা পাসওয়ার্ড মিলছে না।" }, 401);

    render(<AccountView />);
    await screen.findByRole("tab", { name: "লগ ইন" });
    fireEvent.click(screen.getByRole("tab", { name: "লগ ইন" }));
    fireEvent.change(screen.getByLabelText("মোবাইল নম্বর"), {
      target: { value: "01712345678" },
    });
    fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
      target: { value: "nope123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "লগ ইন করুন" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("নম্বর বা পাসওয়ার্ড মিলছে না");
  });
});
