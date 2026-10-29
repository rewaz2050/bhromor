// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/orders";
const access = vi.hoisted(() => ({ checked: true, canManage: true }));
vi.mock("@/lib/use-staff-role", () => ({ useStaffRole: () => access }));
import ShopFulfilmentOverride from "../shop-fulfilment-override";
const order = (over: Partial<Order> = {}) => ({ id: "PS-100", shopId: "shop-1", status: "pending", ...over }) as Order;
beforeEach(() => { access.checked = true; access.canManage = true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("emergency shop fulfilment override", () => {
  it("is not shown for manager or unresolved access", () => {
    access.canManage = false;
    const { rerender } = render(<ShopFulfilmentOverride order={order()} onOverride={vi.fn()} />);
    expect(screen.queryByText("Emergency shop fulfilment override")).toBeNull();
    access.canManage = true; access.checked = false;
    rerender(<ShopFulfilmentOverride order={order()} onOverride={vi.fn()} />);
    expect(screen.queryByText("Emergency shop fulfilment override")).toBeNull();
  });
  it.each([{ shopId: undefined }, { isReturn: true }, { status: "delivered" }, { status: "ready-for-pickup" }])("does not offer an override for %j", (over) => {
    render(<ShopFulfilmentOverride order={order(over as Partial<Order>)} onOverride={vi.fn()} />);
    expect(screen.queryByText("Emergency shop fulfilment override")).toBeNull();
  });
  it("requires a meaningful reason, submits the legal target and trims the recorded reason", async () => {
    const onOverride = vi.fn(async () => true);
    render(<ShopFulfilmentOverride order={order()} onOverride={onOverride} />);
    fireEvent.click(screen.getByText("Emergency shop fulfilment override"));
    const button = screen.getByRole("button", { name: "Record emergency override" });
    const input = screen.getByLabelText("Reason for overriding the shop");
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "too short" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "  Shop unavailable; verified support request  " } });
    fireEvent.click(button);
    await waitFor(() => expect(onOverride).toHaveBeenCalledExactlyOnceWith("confirmed", "Shop unavailable; verified support request"));
    await waitFor(() => expect(input).toHaveValue(""));
  });
  it("offers Ready and optional Preparing, never a rider-owned target", () => {
    render(<ShopFulfilmentOverride order={order({ status: "confirmed" })} onOverride={vi.fn()} />);
    fireEvent.click(screen.getByText("Emergency shop fulfilment override"));
    const values = screen.getAllByRole("option").map((option) => option.getAttribute("value"));
    expect(values.sort()).toEqual(["preparing", "ready-for-pickup"]);
  });
  it("retains the reason and shows an accessible error after failed approval", async () => {
    render(<ShopFulfilmentOverride order={order()} onOverride={async () => false} />);
    fireEvent.click(screen.getByText("Emergency shop fulfilment override"));
    fireEvent.change(screen.getByLabelText("Reason for overriding the shop"), { target: { value: "Shop unavailable; support asked for help" } });
    fireEvent.click(screen.getByRole("button", { name: "Record emergency override" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Override failed");
    expect(screen.getByLabelText("Reason for overriding the shop")).toHaveValue("Shop unavailable; support asked for help");
  });
});
