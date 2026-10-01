import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PaymentCard from "../payment-card";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const props = {
  orderNo: "PS-20260909-0042",
  paymentRef: "TRX98765",
  total: 156000,
  customerPhone: "01711111111",
  onDecided: () => {},
};

describe("PaymentCard (admin order detail)", () => {
  it("renders nothing for COD orders", () => {
    const { container } = render(
      <PaymentCard {...props} payment="cod" paymentStatus="verified" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Verify and Reject while a live order's wallet payment is pending", () => {
    render(
      <PaymentCard
        {...props}
        payment="bkash"
        paymentStatus="pending_verification"
        orderStatus="preparing"
      />,
    );
    expect(screen.getByText("Payment verified")).toBeInTheDocument();
    expect(screen.getByText("Reject payment")).toBeInTheDocument();
    expect(screen.getByText(/Check your bKash wallet/)).toBeInTheDocument();
  });

  it("a CANCELLED order never offers Verify — only the reject that settles it", () => {
    render(
      <PaymentCard
        {...props}
        payment="nagad"
        paymentStatus="pending_verification"
        orderStatus="cancelled"
      />,
    );
    expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
    expect(screen.getByText("Reject payment")).toBeInTheDocument();
    expect(
      screen.getByText(/cancelled while the payment was still pending/),
    ).toBeInTheDocument();
  });

  it("shows the recorded decision once the payment is settled", () => {
    render(
      <PaymentCard
        {...props}
        payment="bkash"
        paymentStatus="rejected"
        paymentVerifiedAt={1700003600000}
        orderStatus="cancelled"
      />,
    );
    expect(screen.getByText(/Rejected/)).toBeInTheDocument();
    expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject payment")).not.toBeInTheDocument();
  });

  it("a verified payment on a later-cancelled order says refund, not 'may start fulfilment'", () => {
    render(
      <PaymentCard
        {...props}
        payment="bkash"
        paymentStatus="verified"
        paymentVerifiedAt={1700003600000}
        orderStatus="cancelled"
      />,
    );
    expect(screen.getByText(/Verified/)).toBeInTheDocument();
    expect(screen.getByText(/cancelled afterwards/)).toBeInTheDocument();
    expect(
      screen.queryByText(/may start fulfilment/),
    ).not.toBeInTheDocument();
  });

  it("posts the decision to the STAFF endpoint by default and to the VENDOR endpoint for actor=\"vendor\" (Batch H)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }),
    );
    const onDecided = vi.fn();
    const { unmount } = render(
      <PaymentCard {...props} payment="bkash" paymentStatus="pending_verification" orderStatus="confirmed" onDecided={onDecided} />,
    );
    fireEvent.click(screen.getByText("Payment verified"));
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    unmount();

    render(
      <PaymentCard
        {...props}
        actor="vendor"
        payment="nagad"
        paymentStatus="pending_verification"
        orderStatus="confirmed"
        onDecided={onDecided}
      />,
    );
    fireEvent.click(screen.getByText("Payment verified"));
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(2));
    expect(calls).toEqual([
      "/api/admin/orders/PS-20260909-0042/payment",
      "/api/vendor/orders/PS-20260909-0042/payment",
    ]);
  });

  describe("who may decide (audit N6)", () => {
    const pending = {
      ...props,
      payment: "bkash" as const,
      paymentStatus: "pending_verification" as const,
      orderStatus: "preparing",
    };

    it("staff get no buttons when the shop verifies its own payments — and are told how to step in", () => {
      render(<PaymentCard {...pending} verifier="shop" />);
      expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
      expect(screen.queryByText("Reject payment")).not.toBeInTheDocument();
      expect(screen.getByTestId("payment-not-yours")).toHaveTextContent(/Waiting for the shop/);
      expect(screen.getByRole("link", { name: /Admin → Shops/ })).toHaveAttribute("href", "/admin/shops");
    });

    it("the shop gets no buttons when staff verify — and is told nothing is needed", () => {
      render(<PaymentCard {...pending} actor="vendor" verifier="platform" />);
      expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
      expect(screen.queryByText("Reject payment")).not.toBeInTheDocument();
      expect(screen.getByTestId("payment-not-yours")).toHaveTextContent(/PROSANTI staff verify/);
    });

    it.each([
      ["staff", "platform"],
      ["staff", "both"],
      ["vendor", "shop"],
      ["vendor", "both"],
    ] as const)("%s still decide when the setting is %s", (actor, verifier) => {
      render(<PaymentCard {...pending} actor={actor} verifier={verifier} />);
      expect(screen.getByText("Payment verified")).toBeInTheDocument();
      expect(screen.queryByTestId("payment-not-yours")).not.toBeInTheDocument();
    });

    it("an absent setting behaves like 'both' (old database)", () => {
      render(<PaymentCard {...pending} actor="vendor" />);
      expect(screen.getByText("Payment verified")).toBeInTheDocument();
    });
  });
});
