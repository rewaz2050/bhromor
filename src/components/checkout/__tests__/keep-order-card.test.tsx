/**
 * The account card on the receipt — asked after the order, never in front
 * of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import KeepOrderCard, { MIN_PASSWORD } from "../keep-order-card";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));

beforeEach(() => {
  h.fetch.mockReset();
  vi.stubGlobal("fetch", h.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const jsonResponse = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const renderCard = () =>
  render(<KeepOrderCard name="Rahat Ahmed" phone="01712345678" orderId="PS-42" />);

const type = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText(/পাসওয়ার্ড/), { target: { value } });

describe("KeepOrderCard", () => {
  it("asks for a password only — the name and phone came from the order", () => {
    renderCard();
    expect(screen.getByTestId("keep-order-card")).toBeInTheDocument();
    expect(screen.queryByLabelText(/মোবাইল|phone/i)).not.toBeInTheDocument();
  });

  it("refuses a short password without calling the server", async () => {
    renderCard();
    type("123");
    fireEvent.click(screen.getByRole("button", { name: /সংরক্ষণ করুন/ }));
    expect(h.fetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      String(MIN_PASSWORD),
    );
  });

  it("saves the order to the account and points at it", async () => {
    h.fetch.mockResolvedValue(jsonResponse(201, { customer: { id: "c1" } }));
    renderCard();
    type("secret123");
    fireEvent.click(screen.getByRole("button", { name: /সংরক্ষণ করুন/ }));

    await waitFor(() => expect(screen.getByTestId("keep-order-done")).toBeInTheDocument());
    expect(screen.getByText(/PS-42/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /আমার অ্যাকাউন্ট/ })).toHaveAttribute(
      "href",
      "/account",
    );
    const [, init] = h.fetch.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Rahat Ahmed",
      phone: "01712345678",
      password: "secret123",
    });
  });

  it("says so when this number already has an account — the order is not lost", async () => {
    h.fetch.mockResolvedValue(
      jsonResponse(409, { error: "এই নম্বরে আগে থেকেই অ্যাকাউন্ট আছে।" }),
    );
    renderCard();
    type("secret123");
    fireEvent.click(screen.getByRole("button", { name: /সংরক্ষণ করুন/ }));
    expect(await screen.findByRole("link", { name: /লগইন করুন/ })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByTestId("keep-order-done")).not.toBeInTheDocument();
  });

  it("fails honestly when the server cannot be reached", async () => {
    h.fetch.mockRejectedValue(new Error("offline"));
    renderCard();
    type("secret123");
    fireEvent.click(screen.getByRole("button", { name: /সংরক্ষণ করুন/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/সংযোগ/);
  });
});
