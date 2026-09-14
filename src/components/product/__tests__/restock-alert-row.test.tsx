/**
 * P2 #2 — the back-in-stock alert on the product page. It exists only while
 * the piece is actually sold out (a "notify me" on something you can buy is
 * a lie), and it promises a call from the shop — never a robot text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RestockAlertRow from "@/components/product/restock-alert-row";
import { PRODUCTS } from "@/lib/catalog";

const inStock = PRODUCTS.find((p) => p.inStock)!;
const outOfStock = { ...inStock, inStock: false };

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/account/me")) return okJson({}, 401);
    return okJson({ waiting: true }, 201);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("RestockAlertRow (P2 #2)", () => {
  it("does not exist for a product you can buy right now", () => {
    render(<RestockAlertRow product={inStock} />);
    expect(screen.queryByText(/Out of stock/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /when it's back/i })).toBeNull();
  });

  it("offers the call-back for a sold-out piece, and records the number", async () => {
    render(<RestockAlertRow product={outOfStock} />);
    expect(screen.getByText(/Out of stock/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Call me when it's back/i }));
    const input = screen.getByLabelText("Your mobile number");
    fireEvent.change(input, { target: { value: "01712345678" } });
    fireEvent.click(screen.getByRole("button", { name: /Call me when it's back/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        `You're on the list for ${outOfStock.name}`,
      ),
    );
    const calls = fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/stock-watch"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toEqual({
      productId: outOfStock.id,
      phone: "01712345678",
    });
    expect((calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("keeps the form closed until the shopper asks for the call", () => {
    render(<RestockAlertRow product={outOfStock} />);
    expect(screen.queryByLabelText("Your mobile number")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Call me when it's back/i }));
    expect(screen.getByLabelText("Your mobile number")).toBeVisible();
  });

  it("says it failed when the save cannot be made", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("nope", { status: 500 }));
    render(<RestockAlertRow product={outOfStock} />);
    fireEvent.click(screen.getByRole("button", { name: /Call me when it's back/i }));
    fireEvent.change(screen.getByLabelText("Your mobile number"), {
      target: { value: "01712345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Call me when it's back/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not save that — try once more.",
      ),
    );
  });
});
