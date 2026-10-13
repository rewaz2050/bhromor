/**
 * "Shoppers are waiting on your reply" on the vendor dashboard (2026-10-13).
 *
 * The Messages tab existed but nothing pointed at it, so a customer's
 * question was invisible until the shop opened the tab. The card's whole job
 * is to be loud when there is something to answer and absent when there is
 * not — a permanent empty card on a counter phone is just noise.
 *
 * Presentational since the same read also feeds the bell, so these tests hand
 * it rows rather than a fetch.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MessagesAwaitingCard from "../messages-awaiting-card";
import type { ThreadSummary } from "@/lib/db/customer-threads";

const thread = (over: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: "t1",
  orderNo: "PS-20261013-0004",
  shopId: "s1",
  shopName: "Prosanti",
  status: "open",
  createdAt: Date.UTC(2026, 9, 13, 6),
  lastMessageAt: Date.UTC(2026, 9, 13, 7),
  lastBody: "Is the M in stock?",
  lastSender: "customer",
  unread: 0,
  ...over,
});

afterEach(cleanup);

describe("MessagesAwaitingCard", () => {
  it("shouts when a shopper's question has no answer", () => {
    render(
      <MessagesAwaitingCard threads={[thread()]} awaiting={1} loading={false} />,
    );
    expect(screen.getByTestId("messages-awaiting-card")).toBeTruthy();
    expect(screen.getByText(/1 shopper is waiting on your reply/)).toBeTruthy();
    expect(screen.getByText(/Is the M in stock\?/)).toBeTruthy();
  });

  it("stays out of the way once the shop has the last word", () => {
    render(
      <MessagesAwaitingCard
        threads={[thread({ lastSender: "shop", lastBody: "Yes, two left." })]}
        awaiting={0}
        loading={false}
      />,
    );
    expect(screen.queryByTestId("messages-awaiting-card")).toBeNull();
  });

  it("says nothing while the inbox is still loading — no empty flash", () => {
    render(<MessagesAwaitingCard threads={[]} awaiting={1} loading />);
    expect(screen.queryByTestId("messages-awaiting-card")).toBeNull();
  });

  it("lists at most three, so a backlog does not push the order queue down", () => {
    const threads = [1, 2, 3, 4].map((n) =>
      thread({ id: `t${n}`, orderNo: `PS-20261013-000${n}` }),
    );
    render(
      <MessagesAwaitingCard threads={threads} awaiting={4} loading={false} />,
    );
    expect(screen.getByText(/4 shoppers are waiting/)).toBeTruthy();
    expect(screen.getAllByText(/PS-20261013-000/)).toHaveLength(3);
  });
});
