import { afterEach, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CheckoutProgress, StepSection } from "../checkout-ui";
import { LanguageProvider } from "@/components/i18n/language-provider";
afterEach(() => { cleanup(); localStorage.clear(); document.cookie = "prosanti-lang=; Max-Age=0"; });
it("names progress, marks the current step and preserves jump destinations", () => {
  const jump = vi.fn();
  render(<CheckoutProgress current={2} labels={["Details", "Delivery", "Review"]} stepOf="Step {n} of 3" onJump={jump} />);
  expect(screen.getByRole("navigation", { name: "Checkout progress" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2 Delivery" })).toHaveAttribute("aria-current", "step");
  fireEvent.click(screen.getByRole("button", { name: "3 Review" }));
  expect(jump).toHaveBeenCalledWith(3);
});
it("localizes progress numbers and exposes programmatically focusable step headings", () => {
  render(<LanguageProvider initialLang="bn"><CheckoutProgress current={1} labels={["তথ্য", "ডেলিভারি", "পর্যালোচনা"]} stepOf="ধাপ {n} / ৩" onJump={vi.fn()} /><StepSection id="test-step" n={1} title="তথ্য"><input aria-label="Field" /></StepSection></LanguageProvider>);
  expect(screen.getByRole("navigation", { name: "চেকআউটের ধাপ" })).toHaveTextContent("ধাপ ১ / ৩");
  const heading = screen.getByRole("heading", { name: "তথ্য" });
  expect(heading).toHaveAttribute("tabindex", "-1");
  heading.focus(); expect(heading).toHaveFocus();
});
