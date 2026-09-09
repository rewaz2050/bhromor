import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExchangeForm } from "../exchange-form";

describe("ExchangeForm Component", () => {
  it("renders size exchange form inputs", () => {
    render(<ExchangeForm />);

    expect(screen.getByText(/ইনস্ট্যান্ট সাইজ এক্সচেঞ্জ ফর্ম/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/PS-YYYYMMDD-XXXX/i)).toBeInTheDocument();
  });
});
