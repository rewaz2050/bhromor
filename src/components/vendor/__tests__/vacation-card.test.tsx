/**
 * B6 (2026-09-28) — the screen where a shop books its own holiday.
 *
 * What is pinned here is the promise, not the layout: the shop sees WHEN it
 * reopens (not merely "closed"), it is told that the reopening happens on its
 * own, and the dates it sends are the dates the database will be asked to
 * store — including "no dates at all" meaning "cancel the holiday".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VacationCard from "@/components/vendor/vacation-card";
import type { ShopVacation } from "@/lib/catalog";

afterEach(() => {
  // A timed-out test must not leave fake timers hanging over the next one.
  vi.useRealTimers();
  cleanup();
});

const saved: Array<{ start: string | null; end: string | null; note: string }> = [];

const renderCard = (vacation?: ShopVacation | null, fail = false) => {
  const onSave = vi.fn(async (patch: { start: string | null; end: string | null; note: string }) => {
    saved.push(patch);
    if (fail) throw new Error("Could not save — try again.");
  });
  render(<VacationCard vacation={vacation ?? null} onSave={onSave} />);
  return onSave;
};

const type = (id: string, value: string) => {
  fireEvent.change(screen.getByTestId(id), { target: { value } });
};

describe("VacationCard (B6)", () => {
  it("says a shop with no holiday is open, and that booking one is possible", () => {
    renderCard(null);
    expect(screen.getByTestId("vacation-state")).toHaveTextContent("No holiday");
    expect(screen.getByTestId("vacation-line")).toHaveTextContent("No holiday booked");
  });

  it("offers no date in the past — a holiday cannot be backdated", () => {
    renderCard(null);
    expect((screen.getByTestId("vacation-start") as HTMLInputElement).min).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it("saves the two dates the shop picked, exactly as picked", async () => {
    const onSave = renderCard(null);
    type("vacation-start", "2026-10-10");
    type("vacation-end", "2026-10-12");
    type("vacation-note", "Closed for Eid");
    fireEvent.click(screen.getByTestId("vacation-save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saved.at(-1)).toEqual({
      start: "2026-10-10",
      end: "2026-10-12",
      note: "Closed for Eid",
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("opens again by itself"),
    );
  });

  it("blocks a save that ends before it starts, and says why", async () => {
    const onSave = renderCard(null);
    type("vacation-start", "2026-10-12");
    type("vacation-end", "2026-10-10");
    expect(screen.getByTestId("vacation-save")).toBeDisabled();
    expect(screen.getByTestId("vacation-hint")).toHaveTextContent("cannot end before it starts");
    fireEvent.click(screen.getByTestId("vacation-save"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("blocks a holiday longer than the cap and points at the Open switch", async () => {
    const onSave = renderCard(null);
    type("vacation-start", "2026-10-01");
    type("vacation-end", "2026-12-31");
    expect(screen.getByTestId("vacation-hint")).toHaveTextContent("at most 45 days");
    fireEvent.click(screen.getByTestId("vacation-save"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("vacation-card")).toHaveTextContent("at most 45 days");
  });

  it("refuses a holiday that has already gone by", () => {
    renderCard(null);
    type("vacation-start", "2020-01-01");
    type("vacation-end", "2020-01-05");
    expect(screen.getByTestId("vacation-save")).toBeDisabled();
    expect(screen.getByTestId("vacation-hint")).toHaveTextContent("already over");
  });

  it("shows a booked holiday with its range and the day orders resume", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-28T12:00:00Z"));
    renderCard({ start: "2026-10-10", end: "2026-10-12", note: "Eid" });
    expect(screen.getByTestId("vacation-state")).toHaveTextContent("Booked");
    const line = screen.getByTestId("vacation-line");
    expect(line).toHaveTextContent("Holiday booked: 10–12 Oct");
    expect(line).toHaveTextContent("starts in 12 days");
    expect(screen.getByTestId("vacation-start")).toHaveValue("2026-10-10");
    expect(screen.getByTestId("vacation-end")).toHaveValue("2026-10-12");
    vi.useRealTimers();
  });

  it("shows a running holiday as running, with the day it ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-11T12:00:00Z"));
    renderCard({ start: "2026-10-10", end: "2026-10-12", note: "Eid" });
    expect(screen.getByTestId("vacation-state")).toHaveTextContent("On holiday");
    expect(screen.getByTestId("vacation-line")).toHaveTextContent(
      "Orders open again on 13 Oct, on their own",
    );
  });

  it("cancels the holiday with two empty dates — the shop takes orders again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse("2026-09-28T12:00:00Z"));
    const onSave = renderCard({ start: "2026-10-10", end: "2026-10-12", note: "Eid" });
    fireEvent.click(screen.getByTestId("vacation-clear"));
    expect(screen.getByTestId("vacation-start")).toHaveValue("");
    fireEvent.click(screen.getByTestId("vacation-save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saved.at(-1)).toEqual({ start: null, end: null, note: "" });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Holiday cleared"),
    );
  });

  it("keeps the note short — it is printed on the storefront", () => {
    renderCard(null);
    type("vacation-note", "x".repeat(400));
    expect((screen.getByTestId("vacation-note") as HTMLInputElement).value).toHaveLength(160);
  });

  it("shows a staff login the holiday but no way to book one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-28T12:00:00Z"));
    render(
      <VacationCard
        vacation={{ start: "2026-10-10", end: "2026-10-12", note: "Eid" }}
        onSave={vi.fn()}
        editable={false}
      />,
    );
    expect(screen.getByTestId("vacation-line")).toHaveTextContent("Holiday booked: 10–12 Oct");
    expect(screen.getByTestId("vacation-readonly")).toHaveTextContent(
      "Only the shop owner can book or cancel a holiday",
    );
    expect(screen.queryByTestId("vacation-save")).toBeNull();
    expect(screen.queryByTestId("vacation-start")).toBeNull();
  });

  it("reports a failed save instead of pretending it worked", async () => {
    renderCard(null, true);
    type("vacation-start", "2026-10-10");
    type("vacation-end", "2026-10-12");
    fireEvent.click(screen.getByTestId("vacation-save"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save"));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
