/** Shared application-form pieces (apply = sign up, 2026-09-26). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplySteps, FormAlert, FormSection, ZoneChips } from "../apply-form-ui";

describe("ApplySteps", () => {
  it("lists the three steps with Bengali numerals", () => {
    render(<ApplySteps kind="vendor" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("১");
    expect(items[2]).toHaveTextContent(/ড্যাশবোর্ড/);
    expect(screen.queryByText(/[0-9]/)).not.toBeInTheDocument();
  });
});

describe("FormSection", () => {
  it("is a fieldset named by its legend", () => {
    render(
      <FormSection step={2} title="লগইন তথ্য" hint="hint here">
        <input aria-label="x" />
      </FormSection>,
    );
    expect(screen.getByRole("group", { name: /লগইন তথ্য/ })).toBeInTheDocument();
    expect(screen.getByText("hint here")).toBeInTheDocument();
  });
});

describe("ZoneChips", () => {
  it("renders pressable toggles that report their state", () => {
    const onToggle = vi.fn();
    render(
      <ZoneChips
        zones={[{ id: "z1", name: "Kandirpar" }, { id: "z2", name: "Tangail" }]}
        selected={["z2"]}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByRole("button", { name: "Kandirpar" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Tangail/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Kandirpar" }));
    expect(onToggle).toHaveBeenCalledWith("z1");
  });

  it("explains an empty zone list instead of rendering nothing", () => {
    render(<ZoneChips zones={[]} selected={[]} onToggle={() => {}} />);
    expect(screen.getByText(/এলাকার তালিকা/)).toBeInTheDocument();
  });
});

describe("FormAlert", () => {
  it("renders nothing without a message and takes focus with one", () => {
    const { rerender } = render(<FormAlert message={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<FormAlert message="ভুল হয়েছে" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("ভুল হয়েছে");
    expect(document.activeElement).toBe(alert);
  });
});
