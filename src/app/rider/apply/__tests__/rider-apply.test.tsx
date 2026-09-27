import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RiderApplyPage from "../page";

vi.mock("@/lib/use-live-zones", () => ({
  useLiveZones: () => ({
    activeZones: [{ id: "z1", name: "Kandirpar", active: true }],
    zones: [{ id: "z1", name: "Kandirpar", active: true }],
    loading: false,
  }),
}));

const fill = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

describe("Rider Apply Page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders rider application form fields", () => {
    render(<RiderApplyPage />);

    expect(screen.getByText(/রাইডার হিসেবে যোগ দিন/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/যেমন: তানভীর আহমেদ/i)).toBeInTheDocument();
  });

  it("collects the login password with the application (apply = sign up)", () => {
    render(<RiderApplyPage />);

    expect(screen.getByLabelText(/লগইন পাসওয়ার্ড/)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText(/পাসওয়ার্ড আবার লিখুন/)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন/ })).toBeInTheDocument();
  });

  it("refuses a short password before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RiderApplyPage />);

    fill(screen.getByPlaceholderText(/যেমন: তানভীর আহমেদ/i), "Tanvir Ahmed");
    fill(screen.getByPlaceholderText("017XXXXXXXX"), "01811111111");
    fill(screen.getByPlaceholderText("rider@example.com"), "rider@example.com");
    fill(screen.getByLabelText(/লগইন পাসওয়ার্ড/), "abc");
    fill(screen.getByLabelText(/পাসওয়ার্ড আবার লিখুন/), "abc");
    fireEvent.click(screen.getByRole("button", { name: /Kandirpar/ }));
    fireEvent.click(screen.getByRole("button", { name: /আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/৬ অক্ষরের/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the password and points to /rider/login after approval", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ applied: true, id: "rider-1", linked: true, account: "existing" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RiderApplyPage />);

    fill(screen.getByPlaceholderText(/যেমন: তানভীর আহমেদ/i), "Tanvir Ahmed");
    fill(screen.getByPlaceholderText("017XXXXXXXX"), "01811111111");
    fill(screen.getByPlaceholderText("rider@example.com"), "rider@example.com");
    fill(screen.getByLabelText(/লগইন পাসওয়ার্ড/), "secret1");
    fill(screen.getByLabelText(/পাসওয়ার্ড আবার লিখুন/), "secret1");
    fireEvent.click(screen.getByRole("button", { name: /Kandirpar/ }));
    fireEvent.click(screen.getByRole("button", { name: /আবেদন জমা দিন ও অ্যাকাউন্ট তৈরি করুন/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/riders/apply");
    expect(JSON.parse(String(init.body))).toMatchObject({
      contactEmail: "rider@example.com",
      password: "secret1",
      vehicle: "bike",
      zoneIds: ["z1"],
    });

    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(/\/rider\/login/);
    expect(note).toHaveTextContent(/আগে থেকেই PROSANTI অ্যাকাউন্ট ছিল/);
    expect(screen.getByRole("link", { name: /রাইডার লগইন পেইজ/ })).toHaveAttribute("href", "/rider/login");
  });
});
