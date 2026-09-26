import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShopApplyPage from "../page";

vi.mock("@/lib/use-live-zones", () => ({
  useLiveZones: () => ({
    activeZones: [{ id: "z1", name: "Kandirpar", active: true }],
    zones: [{ id: "z1", name: "Kandirpar", active: true }],
    loading: false,
  }),
}));

const fill = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

describe("Shop Apply Page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders shop application form fields", () => {
    render(<ShopApplyPage />);

    expect(screen.getByText(/দোকানদার হিসেবে যুক্ত হোন/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/যেমন: আরিয়ান ফ্যাশন/i)).toBeInTheDocument();
  });

  it("collects the login password with the application (apply = sign up)", () => {
    render(<ShopApplyPage />);

    const password = screen.getByLabelText(/লগইন পাসওয়ার্ড/);
    const confirm = screen.getByLabelText(/পাসওয়ার্ড আবার লিখুন/);
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(confirm).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন/ })).toBeInTheDocument();
    // No separate "create account" hand-off any more.
    expect(screen.queryByText(/অ্যাকাউন্ট খুলুন →/)).not.toBeInTheDocument();
  });

  it("refuses a mismatched password pair before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ShopApplyPage />);

    fill(screen.getByPlaceholderText(/যেমন: আরিয়ান ফ্যাশন/i), "Arian Fashion");
    fill(screen.getByPlaceholderText("017XXXXXXXX"), "01712345678");
    fill(screen.getByPlaceholderText("shop@example.com"), "shop@example.com");
    fill(screen.getByLabelText(/লগইন পাসওয়ার্ড/), "secret1");
    fill(screen.getByLabelText(/পাসওয়ার্ড আবার লিখুন/), "secret2");
    fill(screen.getByPlaceholderText(/কান্দিরপাড় মার্কেট/), "Kandirpar");
    fireEvent.click(screen.getByRole("button", { name: /Kandirpar/ }));
    fireEvent.click(screen.getByRole("button", { name: /আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/মিলছে না/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the password and shows the sign-in-after-approval note", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ applied: true, id: "shop-1", linked: true, account: "created" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ShopApplyPage />);

    fill(screen.getByPlaceholderText(/যেমন: আরিয়ান ফ্যাশন/i), "Arian Fashion");
    fill(screen.getByPlaceholderText("017XXXXXXXX"), "01712345678");
    fill(screen.getByPlaceholderText("shop@example.com"), "Shop@Example.com");
    fill(screen.getByLabelText(/লগইন পাসওয়ার্ড/), "secret1");
    fill(screen.getByLabelText(/পাসওয়ার্ড আবার লিখুন/), "secret1");
    fill(screen.getByPlaceholderText(/কান্দিরপাড় মার্কেট/), "Kandirpar");
    fireEvent.click(screen.getByRole("button", { name: /Kandirpar/ }));
    fireEvent.click(screen.getByRole("button", { name: /আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/shops/apply");
    expect(JSON.parse(String(init.body))).toMatchObject({
      contactEmail: "shop@example.com",
      password: "secret1",
      zoneIds: ["z1"],
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/\/vendor\/login/);
    expect(screen.getByRole("link", { name: /ভেন্ডর লগইন পেইজ/ })).toHaveAttribute("href", "/vendor/login");
  });
});
