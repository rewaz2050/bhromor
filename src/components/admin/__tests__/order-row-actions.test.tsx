// @vitest-environment jsdom
/**
 * Batch H (2026-09-18): the admin list row carries the order's one next tap.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderRowActions } from "../order-row-actions";
import type { Order } from "@/lib/orders";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const o = (over: Partial<Order>): Order =>
  ({
    id: "PS-20260918-0007",
    status: "pending",
    payment: "cod",
    paymentStatus: "verified",
    ...over,
  }) as Order;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OrderRowActions", () => {
  it("shows shop ownership instead of routine Confirm/Ready for marketplace orders", () => {
    render(<OrderRowActions order={o({ shopId: "shop-1" })} advance={vi.fn()} cancel={vi.fn()} />);
    expect(screen.getByText("Shop confirms and prepares this order.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm order/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ready/ })).toBeNull();
  });
  it("pending: Confirm + Cancel, Confirm advances without a prompt", async () => {
    const advance = vi.fn(async () => true);
    const cancel = vi.fn(async () => true);
    render(<OrderRowActions order={o({})} advance={advance} cancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: /Confirm order/ }));
    await waitFor(() => expect(advance).toHaveBeenCalledWith("PS-20260918-0007", "confirmed", undefined));
    expect(screen.getByRole("button", { name: /Cancel order PS-20260918-0007/ })).toBeInTheDocument();
  });

  it("Cancel asks first and does nothing when dismissed", async () => {
    const cancel = vi.fn(async () => true);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OrderRowActions order={o({ status: "confirmed" })} advance={vi.fn()} cancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel order/ }));
    expect(cancel).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Cancel order/ }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("PS-20260918-0007"));
  });

  it("an unverified bKash order shows the verification link instead of a Ready button", () => {
    render(
      <OrderRowActions
        order={o({ status: "confirmed", payment: "bkash", paymentStatus: "pending_verification" })}
        advance={vi.fn()}
        cancel={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: /Verify the bKash payment first/ });
    expect(link).toHaveAttribute("href", "/admin/orders/PS-20260918-0007");
    expect(screen.queryByRole("button", { name: /Ready/ })).toBeNull();
  });

  it("rider-owned home delivery: a wait message, no buttons at all", () => {
    render(<OrderRowActions order={o({ status: "out-for-delivery" })} advance={vi.fn()} cancel={vi.fn()} />);
    expect(screen.getByText(/Rider is on the way/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("a ready counter pickup links to verification, never performs an unchecked handover", () => {
    const advance = vi.fn(async () => true);
    render(<OrderRowActions order={o({ status: "ready-for-pickup", isPickup: true })} advance={advance} cancel={vi.fn()} />);
    expect(screen.getByRole("link",{name:"Verify pickup PIN"})).toHaveAttribute("href","/admin/orders/PS-20260918-0007");
    expect(advance).not.toHaveBeenCalled();
  });

  it("delivered: a dash, nothing to press", () => {
    render(<OrderRowActions order={o({ status: "delivered" })} advance={vi.fn()} cancel={vi.fn()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
