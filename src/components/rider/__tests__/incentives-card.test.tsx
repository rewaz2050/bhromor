import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import IncentivesCard from "../incentives-card";
import type { RiderIncentiveView } from "@/lib/rider-incentives";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = (over: Partial<RiderIncentiveView> = {}): RiderIncentiveView => ({
  settings: { dailyTarget: 8, dailyBonus: 5000, referralBonus: 20000, referralAfter: 10 },
  today: { done: 3, target: 8, left: 5, reached: false, percent: 38 },
  todayPaid: false,
  referral: { code: "K7MQ2X", after: 10, bonus: 20000, items: [], totalEarned: 0 },
  totalEarned: 0,
  ...over,
});

describe("<IncentivesCard>", () => {
  it("renders nothing without data, or while both bonuses are off", () => {
    const { container, rerender } = render(<IncentivesCard view={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<IncentivesCard view={view({ settings: { dailyTarget: 0, dailyBonus: 0, referralBonus: 0, referralAfter: 10 } })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how far today's target is", () => {
    render(<IncentivesCard view={view()} />);
    expect(screen.getByTestId("daily-status")).toHaveTextContent("3/8 শেষ — আর 5টি বাকি");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });

  it("says the bonus is coming when reached but not yet paid, and paid once it is", () => {
    const reached = { done: 8, target: 8, left: 0, reached: true, percent: 100 };
    const { rerender } = render(<IncentivesCard view={view({ today: reached })} />);
    expect(screen.getByTestId("daily-status")).toHaveTextContent("কিছুক্ষণের মধ্যেই");
    rerender(<IncentivesCard view={view({ today: reached, todayPaid: true })} />);
    expect(screen.getByTestId("daily-status")).toHaveTextContent("ওয়ালেটে যোগ হয়েছে");
  });

  it("hides the daily block when the daily bonus is off but keeps the referral one", () => {
    render(<IncentivesCard view={view({ today: null, settings: { dailyTarget: 0, dailyBonus: 0, referralBonus: 20000, referralAfter: 10 } })} />);
    expect(screen.queryByTestId("daily-progress")).toBeNull();
    expect(screen.getByTestId("referral-code")).toHaveTextContent("K7MQ2X");
  });

  it("lists the referred riders' progress and what was paid", () => {
    render(
      <IncentivesCard
        view={view({
          referral: {
            code: "K7MQ2X", after: 10, bonus: 20000, totalEarned: 20000,
            items: [{ name: "Karim", done: 4, rewarded: false }, { name: "Salma", done: 12, rewarded: true }],
          },
        })}
      />,
    );
    const list = screen.getByTestId("referral-list");
    expect(list).toHaveTextContent("Karim");
    expect(list).toHaveTextContent("4/10 ডেলিভারি");
    expect(list).toHaveTextContent("বোনাস পেয়েছেন ✓");
    expect(screen.getByTestId("referral")).toHaveTextContent("৳200");
  });

  it("copies the invitation when the browser cannot share", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<IncentivesCard view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "শেয়ার করুন" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("K7MQ2X")));
    expect(await screen.findByRole("button", { name: /কপি হয়েছে/ })).toBeInTheDocument();
  });

  it("uses the native share sheet when there is one", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share });
    render(<IncentivesCard view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "শেয়ার করুন" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ text: expect.stringContaining("K7MQ2X") }));
  });
});
