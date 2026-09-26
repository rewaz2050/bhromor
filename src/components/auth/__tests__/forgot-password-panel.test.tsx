/**
 * "Forgot password?" panel (2026-09-26; no SMS, no e-mail): request →
 * pending (polled, survives reload) → approved → set → done; rejected and
 * expired branches.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poll = vi.hoisted(() => ({ calls: [] as { intervalMs: number; enabled: boolean }[] }));
vi.mock("@/lib/use-poll", () => ({
  usePoll: (_fn: unknown, intervalMs: number, enabled: boolean) => {
    poll.calls.push({ intervalMs, enabled });
  },
}));

import ForgotPasswordPanel, { RESET_STATUS_POLL_MS } from "../forgot-password-panel";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fill = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

beforeEach(() => {
  window.localStorage.clear();
  poll.calls = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ForgotPasswordPanel", () => {
  it("opens from a link, files the request and waits for staff (polling only while pending)", async () => {
    const fetchMock = vi.fn(async () => json({ status: "pending", created: true }, 202));
    vi.stubGlobal("fetch", fetchMock);
    render(<ForgotPasswordPanel kind="rider" lang="bn" />);

    expect(poll.calls.at(-1)?.enabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "পাসওয়ার্ড ভুলে গেছেন?" }));
    fill(screen.getByLabelText("ইমেইল"), " Rider@Example.com ");
    fill(screen.getByLabelText("মোবাইল নম্বর"), "+880 1811-111111");
    expect(screen.getByLabelText("মোবাইল নম্বর")).toHaveValue("01811111111");
    fireEvent.click(screen.getByRole("button", { name: "অনুরোধ পাঠান" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-request");
    expect(JSON.parse(String(init.body))).toEqual({ kind: "rider", email: "Rider@Example.com", phone: "01811111111" });

    expect(await screen.findByText(/অনুমোদনের অপেক্ষায়/)).toBeInTheDocument();
    expect(poll.calls.at(-1)).toEqual({ intervalMs: RESET_STATUS_POLL_MS, enabled: true });
    expect(JSON.parse(window.localStorage.getItem("prosanti.reset.rider") ?? "{}")).toEqual({
      email: "rider@example.com",
      phone: "01811111111",
    });
  });

  it("shows the server's refusal and keeps the form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "এই ইমেইল ও ফোন নম্বরের কোনো রাইডার লগইন পাওয়া যায়নি" }, 404)));
    render(<ForgotPasswordPanel kind="rider" lang="bn" />);
    fireEvent.click(screen.getByRole("button", { name: "পাসওয়ার্ড ভুলে গেছেন?" }));
    fill(screen.getByLabelText("ইমেইল"), "x@example.com");
    fill(screen.getByLabelText("মোবাইল নম্বর"), "01811111111");
    fireEvent.click(screen.getByRole("button", { name: "অনুরোধ পাঠান" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/পাওয়া যায়নি/);
    expect(screen.getByRole("button", { name: "অনুরোধ পাঠান" })).toBeInTheDocument();
    expect(window.localStorage.getItem("prosanti.reset.rider")).toBeNull();
  });

  it("resumes a stored request on mount and switches to the password form once approved", async () => {
    window.localStorage.setItem("prosanti.reset.vendor", JSON.stringify({ email: "shop@example.com", phone: "01712345678" }));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("/api/auth/reset-request?")) {
        return json({ status: "approved", expiresAt: "2026-09-27T10:00:00Z" });
      }
      return json({ done: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<ForgotPasswordPanel kind="vendor" lang="en" onDone={onDone} />);

    expect(await screen.findByText("Approved — set your new password")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("kind=vendor&email=shop%40example.com&phone=01712345678");

    fill(screen.getByLabelText("New password"), "brandnew1");
    fill(screen.getByLabelText("Repeat it"), "brandnew2");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/মিলছে না/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fill(screen.getByLabelText("Repeat it"), "brandnew1");
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-complete");
    expect(JSON.parse(String(init.body))).toEqual({ kind: "vendor", email: "shop@example.com", phone: "01712345678", password: "brandnew1" });

    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith("shop@example.com");
    expect(window.localStorage.getItem("prosanti.reset.vendor")).toBeNull();
  });

  it("shows the staff note on a rejection and offers to ask again", async () => {
    window.localStorage.setItem("prosanti.reset.rider", JSON.stringify({ email: "r@example.com", phone: "01811111111" }));
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "rejected", note: "ফোনে মেলেনি" })));
    render(<ForgotPasswordPanel kind="rider" lang="bn" />);
    expect(await screen.findByText("অনুরোধটি অনুমোদন করা যায়নি")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/ফোনে মেলেনি/);
    fireEvent.click(screen.getByRole("button", { name: "আবার অনুরোধ করুন" }));
    expect(screen.getByRole("button", { name: "অনুরোধ পাঠান" })).toBeInTheDocument();
    expect(screen.getByLabelText("ইমেইল")).toHaveValue("r@example.com");
    expect(window.localStorage.getItem("prosanti.reset.rider")).toBeNull();
  });

  it("forgets a request that was already used elsewhere", async () => {
    window.localStorage.setItem("prosanti.reset.rider", JSON.stringify({ email: "r@example.com", phone: "01811111111" }));
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "used" })));
    render(<ForgotPasswordPanel kind="rider" lang="bn" />);
    await waitFor(() => expect(window.localStorage.getItem("prosanti.reset.rider")).toBeNull());
    expect(await screen.findByRole("button", { name: "পাসওয়ার্ড ভুলে গেছেন?" })).toBeInTheDocument();
  });
});
