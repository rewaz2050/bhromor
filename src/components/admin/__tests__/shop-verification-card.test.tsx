/**
 * B5 (2026-09-28) — the staff panel.
 *
 * What could go wrong here is a quiet lie: a badge handed over without the
 * paperwork, or one silently taken away. So the panel must warn BEFORE the
 * save ("this removes the badge"), keep the badge tied to both boxes, and keep
 * the officer's name and the private note off anything shopper-facing (they are
 * passed in as staff-only props and never rendered for the public — asserted by
 * the vendor card test).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShopVerificationCard from "@/components/admin/shop-verification-card";
import type { VerificationEvent } from "@/lib/shop-verification";

afterEach(cleanup);

const NOW = Date.parse("2026-09-28T12:00:00Z");

const events: VerificationEvent[] = [
  {
    id: 2,
    shopId: "s1",
    at: NOW - 2 * 86_400_000,
    action: "unverified",
    nid: true,
    tradeLicence: false,
    note: "licence expired",
    actorEmail: "staff@prosanti.example",
  },
  {
    id: 1,
    shopId: "s1",
    at: NOW - 90 * 86_400_000,
    action: "verified",
    nid: true,
    tradeLicence: true,
    note: null,
    actorEmail: "admin@prosanti.example",
  },
];

const props = (over: Partial<Parameters<typeof ShopVerificationCard>[0]> = {}) => ({
  verification: { nid: false, tradeLicence: false } as const,
  onSave: vi.fn(async () => {}),
  ...over,
});

describe("ShopVerificationCard (B5)", () => {
  it("starts from what the database says, and saves what staff ticked", async () => {
    const onSave = vi.fn(async () => {});
    render(<ShopVerificationCard {...props({ onSave })} />);
    expect(screen.getByTestId("verification-state")).toHaveTextContent("Not verified");

    fireEvent.click(screen.getByTestId("verify-nid"));
    fireEvent.click(screen.getByTestId("verify-licence"));
    fireEvent.change(screen.getByTestId("verify-note"), { target: { value: "NID + licence seen" } });
    fireEvent.click(screen.getByTestId("verify-save"));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        nid: true,
        tradeLicence: true,
        note: "NID + licence seen",
      }),
    );
  });

  it("says, before saving, that the badge is about to appear", () => {
    render(<ShopVerificationCard {...props()} />);
    fireEvent.click(screen.getByTestId("verify-nid"));
    fireEvent.click(screen.getByTestId("verify-licence"));
    expect(screen.getByTestId("verify-gain")).toHaveTextContent("badge");
  });

  it("warns, before saving, that lifting a check removes the badge", () => {
    render(
      <ShopVerificationCard
        {...props({ verification: { nid: true, tradeLicence: true, verifiedAt: NOW } })}
      />,
    );
    expect(screen.getByTestId("verification-state")).toHaveTextContent("Verified");
    fireEvent.click(screen.getByTestId("verify-licence"));
    expect(screen.getByTestId("verify-warning")).toHaveTextContent("removes the badge");
  });

  it("names what is still unchecked", () => {
    render(<ShopVerificationCard {...props({ verification: { nid: true, tradeLicence: false } })} />);
    expect(screen.getByTestId("verify-missing")).toHaveTextContent("trade licence");
  });

  it("refuses an empty save instead of quietly clearing a badge", async () => {
    const onSave = vi.fn(async () => {});
    render(<ShopVerificationCard {...props({ onSave })} />);
    // Nothing ticked, no note → the button is shut.
    expect(screen.getByTestId("verify-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("verify-note"), { target: { value: "  " } });
    expect(screen.getByTestId("verify-save")).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the typed note when the save fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("only staff can verify a shop");
    });
    render(<ShopVerificationCard {...props({ onSave })} />);
    fireEvent.click(screen.getByTestId("verify-nid"));
    fireEvent.change(screen.getByTestId("verify-note"), { target: { value: "NID seen" } });
    fireEvent.click(screen.getByTestId("verify-save"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("only staff"));
    expect(screen.getByTestId("verify-note")).toHaveValue("NID seen");
    expect(screen.getByTestId("verify-nid")).toBeChecked();
  });

  it("shows who checked, when, and the history", () => {
    render(
      <ShopVerificationCard
        {...props({
          verification: { nid: true, tradeLicence: true, verifiedAt: NOW },
          audit: { note: "NID + licence seen", byEmail: "staff@prosanti.example", at: NOW },
          events,
        })}
      />,
    );
    const history = screen.getByTestId("verify-history");
    expect(history).toHaveTextContent("staff@prosanti.example");
    expect(history).toHaveTextContent("Badge removed");
    expect(history).toHaveTextContent("licence expired");
    expect(history).toHaveTextContent("admin@prosanti.example");
  });

  it("says 'never verified' rather than inventing an officer", () => {
    render(
      <ShopVerificationCard
        {...props({ audit: { note: null, byEmail: null, at: null } })}
      />,
    );
    expect(screen.getByTestId("verify-history")).toHaveTextContent("Never verified");
  });
});
