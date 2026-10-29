/** Show / hide password toggle (apply = sign up, 2026-09-26). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PasswordInput from "../password-input";

describe("PasswordInput", () => {
  it("starts masked, reveals on tap, and stays labelled by the wrapping label", () => {
    render(
      <label>
        Secret
        <PasswordInput className="field" toggle={{ show: "Show", hide: "Hide" }} defaultValue="hunter2" />
      </label>,
    );
    const input = screen.getByLabelText("Secret");
    expect(input).toHaveAttribute("type", "password");
    expect(input.className).toContain("field");

    const toggle = screen.getByRole("button", { name: "Show" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("never submits the form from the toggle", () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <PasswordInput aria-label="pw" />
      </form>,
    );
    expect(screen.getByRole("button", { name: "Show" })).toHaveAttribute("type", "button");
  });
  it("associates its toggle with the input and respects disabled state", () => {
    render(<PasswordInput id="disabled-password" disabled aria-label="Secret" />);
    const toggle = screen.getByRole("button", { name: "Show" });
    expect(toggle).toHaveAttribute("aria-controls", "disabled-password");
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Secret")).toHaveAttribute("type", "password");
  });

  it("passes a ref through to the actual input", () => {
    const ref = vi.fn();
    render(<PasswordInput ref={ref} aria-label="Secret" />);
    expect(ref).toHaveBeenCalledWith(screen.getByLabelText("Secret"));
  });

});
