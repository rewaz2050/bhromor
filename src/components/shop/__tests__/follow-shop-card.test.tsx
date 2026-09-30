/**
 * B1 (2026-09-28) — "নতুন পণ্যের খবর দিন" on the shop page.
 *
 * Two promises are checked here because they are the ones a shopper can be
 * misled by: the card says the shop will CALL a number whose phone has no
 * notifications (never "we'll text you"), and once the shopper follows, the
 * very same control un-follows — no dead end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FollowShopCard from "@/components/shop/follow-shop-card";

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/account/me")) return okJson({}, 401);
    const method = init?.method ?? "GET";
    return okJson({ following: method !== "DELETE" }, method === "DELETE" ? 200 : 201);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const followCalls = () =>
  fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/shop-follow"));
const bodyOf = (call: unknown[]) =>
  JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;

describe("FollowShopCard (B1)", () => {
  it("names the shop, promises a call when push is off, and hides the phone box until asked", () => {
    render(<FollowShopCard shopId="shop-1" shopName="রঙধনু বস্ত্রালয়" />);
    expect(screen.getByTestId("follow-shop")).toBeVisible();
    expect(screen.getByText(/রঙধনু বস্ত্রালয়/)).toBeVisible();
    expect(screen.getByText(/the shop gets your number and calls/i)).toBeVisible();
    expect(screen.queryByLabelText("Your mobile number")).toBeNull();
    expect(followCalls()).toHaveLength(0);
  });

  it("follows with the typed number and the marketing tick", async () => {
    render(<FollowShopCard shopId="shop-1" shopName="রঙধনু বস্ত্রালয়" />);
    fireEvent.click(screen.getByRole("button", { name: /tell me about new pieces/i }));

    const input = screen.getByLabelText("Your mobile number");
    fireEvent.change(input, { target: { value: "01712345678" } });
    expect(screen.getByTestId("follow-marketing")).toBeChecked();
    fireEvent.click(screen.getByTestId("follow-submit"));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "You follow রঙধনু বস্ত্রালয়",
      ),
    );
    expect(followCalls()).toHaveLength(1);
    const [url, init] = followCalls()[0];
    expect(String(url)).toBe("/api/shop-follow");
    expect((init as RequestInit).method).toBe("POST");
    expect(bodyOf(followCalls()[0])).toEqual({
      shopId: "shop-1",
      phone: "01712345678",
      marketingOk: true,
    });
  });

  it("sends the opt-out when the shopper unticks news", async () => {
    render(<FollowShopCard shopId="shop-1" shopName="শান্তি স্টোর" />);
    fireEvent.click(screen.getByRole("button", { name: /tell me about new pieces/i }));
    fireEvent.change(screen.getByLabelText("Your mobile number"), {
      target: { value: "01812345678" },
    });
    fireEvent.click(screen.getByTestId("follow-marketing"));
    fireEvent.click(screen.getByTestId("follow-submit"));

    await waitFor(() => expect(followCalls()).toHaveLength(1));
    expect(bodyOf(followCalls()[0]).marketingOk).toBe(false);
  });

  it("lets the same card stop the follow instead of dead-ending", async () => {
    render(<FollowShopCard shopId="shop-1" shopName="শান্তি স্টোর" />);
    fireEvent.click(screen.getByRole("button", { name: /tell me about new pieces/i }));
    fireEvent.change(screen.getByLabelText("Your mobile number"), {
      target: { value: "01812345678" },
    });
    fireEvent.click(screen.getByTestId("follow-submit"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("You follow শান্তি স্টোর"),
    );

    fireEvent.click(screen.getByTestId("follow-stop"));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const stop = followCalls().at(-1);
    expect((stop?.[1] as RequestInit).method).toBe("DELETE");
    expect(bodyOf(stop ?? [])).toEqual({
      shopId: "shop-1",
      phone: "01812345678",
      marketingOk: true,
    });
  });

  it("says so plainly when saving fails", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/account/me")) return okJson({}, 401);
      return okJson({ error: "no" }, 503);
    });
    render(<FollowShopCard shopId="shop-1" shopName="শান্তি স্টোর" />);
    fireEvent.click(screen.getByRole("button", { name: /tell me about new pieces/i }));
    fireEvent.change(screen.getByLabelText("Your mobile number"), {
      target: { value: "01812345678" },
    });
    fireEvent.click(screen.getByTestId("follow-submit"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/try once more/i),
    );
  });
});
