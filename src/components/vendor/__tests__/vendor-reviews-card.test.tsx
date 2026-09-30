/**
 * B2 (2026-09-28) — the reviews card.
 *
 * The card is the only place a shop writes something the public will read, so
 * the tests pin the behaviours that keep it honest: unanswered reviews come
 * first (oldest first), the waiting count includes the average rating of those
 * unanswered reviews, a save that fails keeps the typed words on screen, and
 * the answer shown afterwards is the one the server returned.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VendorReviewsCard from "@/components/vendor/vendor-reviews-card";
import type { VendorReviewRow } from "@/lib/use-vendor";

afterEach(cleanup);

const row = (over: Partial<VendorReviewRow> = {}): VendorReviewRow => ({
  id: over.id ?? "r1",
  productId: "p1",
  productName: "রঙিন পাঞ্জাবি",
  productSlug: "rongin-panjabi",
  rating: over.rating ?? 4,
  author: over.author ?? "Rima",
  body: over.body ?? "Fabric is lovely, sleeve is short.",
  date: over.date ?? Date.parse("2026-09-20T10:00:00Z"),
  verified: true,
  photos: over.photos ?? [],
  ...over,
});

describe("VendorReviewsCard (B2)", () => {
  it("says there is nothing to answer instead of showing an empty box", () => {
    render(<VendorReviewsCard reviews={[]} onReply={vi.fn()} />);
    expect(screen.getByTestId("vendor-reviews-empty")).toBeVisible();
    expect(screen.queryByTestId("reply-box")).toBeNull();
  });

  it("counts the waiting reviews and puts the oldest complaint first", () => {
    render(
      <VendorReviewsCard
        reviews={[
          row({ id: "answered", date: Date.parse("2026-09-25T10:00:00Z"), vendorReply: "Thank you!" }),
          row({ id: "waiting-new", date: Date.parse("2026-09-24T10:00:00Z") }),
          row({ id: "waiting-old", date: Date.parse("2026-09-19T10:00:00Z"), rating: 2 }),
        ]}
        onReply={vi.fn()}
      />,
    );
    const summary = screen.getByTestId("vendor-reviews-summary");
    expect(summary).toHaveTextContent("3 approved reviews");
    expect(summary).toHaveTextContent("1 answered");
    expect(summary).toHaveTextContent("2 waiting");
    expect(summary).toHaveTextContent("(avg 3.0★)");

    const ids = screen
      .getAllByTestId(/^vendor-review-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(ids).toEqual(["vendor-review-waiting-old", "vendor-review-waiting-new", "vendor-review-answered"]);
    // The answered one shows the reply, not a box.
    expect(screen.getByTestId("review-reply")).toHaveTextContent("Thank you!");
    expect(screen.getAllByTestId("reply-box")).toHaveLength(2);
  });

  it("sends the typed reply and shows what the server returned", async () => {
    const onReply = vi.fn(async (id: string, text: string) => ({
      ...row({ id }),
      vendorReply: text,
      vendorReplyAt: Date.parse("2026-09-28T06:00:00Z"),
    }));
    render(<VendorReviewsCard reviews={[row()]} onReply={onReply} />);
    const box = screen.getByTestId("reply-box");
    fireEvent.change(box, { target: { value: "Sorry about the sleeve — we are remaking it." } });
    fireEvent.click(screen.getByTestId("reply-save"));

    await waitFor(() => expect(screen.getByTestId("review-reply")).toBeVisible());
    expect(onReply).toHaveBeenCalledWith("r1", "Sorry about the sleeve — we are remaking it.");
    expect(screen.getByTestId("review-reply")).toHaveTextContent("we are remaking it");
    expect(screen.queryByTestId("reply-box")).toBeNull();
  });

  it("keeps the typed words and says what went wrong when the save fails", async () => {
    const onReply = vi.fn(async () => {
      throw new Error("That review is not available to your shop.");
    });
    render(<VendorReviewsCard reviews={[row()]} onReply={onReply} />);
    fireEvent.change(screen.getByTestId("reply-box"), {
      target: { value: "Thank you for the honest note." },
    });
    fireEvent.click(screen.getByTestId("reply-save"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That review is not available to your shop.",
      ),
    );
    expect(screen.getByTestId("reply-box")).toHaveValue("Thank you for the honest note.");
  });

  it("shows the buyer photos and the product the review is about", () => {
    render(
      <VendorReviewsCard
        reviews={[
          row({ photos: ["https://cdn.example/a.jpg"], vendorReply: "Thanks!" }),
        ]}
        onReply={vi.fn()}
      />,
    );
    expect(screen.getByAltText("Buyer photo on রঙিন পাঞ্জাবি")).toHaveAttribute(
      "src",
      "https://cdn.example/a.jpg",
    );
    expect(screen.getByTestId("review-product")).toHaveTextContent("রঙিন পাঞ্জাবি");
  });

  it("can reword a reply and keeps the answered stamp visible", async () => {
    const onReply = vi.fn(async (id: string, text: string) => ({
      ...row({ id, vendorReply: text }),
      vendorReplyAt: Date.parse("2026-09-29T06:00:00Z"),
    }));
    render(
      <VendorReviewsCard
        reviews={[row({ vendorReply: "Thank you!", vendorReplyAt: Date.parse("2026-09-21T06:00:00Z") })]}
        onReply={onReply}
      />,
    );
    expect(screen.getByTestId("review-reply")).toHaveTextContent("Your reply");
    fireEvent.click(screen.getByRole("button", { name: /reword/i }));
    const box = screen.getByTestId("reply-box");
    expect(box).toHaveValue("Thank you!");
    fireEvent.change(box, { target: { value: "Thank you — and we are remaking the sleeve." } });
    fireEvent.click(screen.getByTestId("reply-save"));

    await waitFor(() =>
      expect(screen.getByTestId("review-reply")).toHaveTextContent("remaking the sleeve"),
    );
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("shows only the first few on the dashboard, with a way to the rest", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ id: `r${i}`, date: Date.parse("2026-09-20T10:00:00Z") + i * 1000 }),
    );
    render(
      <VendorReviewsCard reviews={rows} onReply={vi.fn()} limit={3} allHref="/vendor/reviews" />,
    );
    expect(screen.getAllByTestId(/^vendor-review-/)).toHaveLength(3);
    expect(screen.getByTestId("vendor-reviews-more")).toHaveTextContent("+2 more");
    expect(screen.getByRole("link", { name: /see all reviews/i })).toHaveAttribute(
      "href",
      "/vendor/reviews",
    );
  });
});
