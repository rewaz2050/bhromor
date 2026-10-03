import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TripStepper, { tripStepIndex } from "../trip-stepper";

afterEach(cleanup);

const statuses = () =>
  Array.from(screen.getByTestId("trip-stepper").querySelectorAll("li")).map((li) => li.getAttribute("data-status"));

describe("TripStepper", () => {
  it("maps states to step indexes", () => {
    expect(tripStepIndex("offered")).toBe(0);
    expect(tripStepIndex("accepted")).toBe(1);
    expect(tripStepIndex("picked_up")).toBe(2);
    expect(tripStepIndex("delivered")).toBe(3);
  });

  it("marks earlier steps done, the current one active and the rest todo", () => {
    render(<TripStepper state="accepted" />);
    expect(statuses()).toEqual(["done", "active", "todo", "todo"]);
  });

  it("an offer is on step one; a delivered trip is complete", () => {
    render(<TripStepper state="offered" />);
    expect(statuses()).toEqual(["active", "todo", "todo", "todo"]);
    cleanup();
    render(<TripStepper state="delivered" />);
    expect(statuses()).toEqual(["done", "done", "done", "done"]);
  });
});
