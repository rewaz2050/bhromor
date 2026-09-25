import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProfileCard from "../profile-card";

afterEach(() => vi.restoreAllMocks());

describe("customer profile card", () => {
  it("keeps login phone read-only and saves a changed name", async () => {
    const refresh = vi.fn(async () => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ customer: { id: "c1", name: "নতুন নাম", phone: "01712345678" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(
      <ProfileCard
        customer={{ id: "c1", name: "রহিম", phone: "01712345678" }}
        onSaved={refresh}
      />,
    );

    expect(screen.getAllByText("01712345678")).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: /লগইন নম্বর/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "নাম পরিবর্তন" }));
    fireEvent.change(screen.getByLabelText("আপনার নাম"), { target: { value: "নতুন নাম" } });
    fireEvent.click(screen.getByRole("button", { name: "সেভ করুন" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/me",
      expect.objectContaining({ method: "PATCH" }),
    ));
    expect(refresh).toHaveBeenCalledOnce();
    expect(await screen.findByText("প্রোফাইল আপডেট হয়েছে।")).toBeInTheDocument();
  });
});
