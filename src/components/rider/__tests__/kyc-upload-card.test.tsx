/**
 * Round 4 (2026-09-26) — the KYC upload card on /rider/login: reads the
 * current state, uploads one document through the signed Cloudinary flow
 * and stores the URL via /api/rider/kyc, in Bangla with Bengali digits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KycUploadCard from "../kyc-upload-card";

const URL_OK = "https://res.cloudinary.com/demo/image/upload/v1/prosanti/rider-kyc/nid.jpg";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stateEmpty = { kyc: {}, submittedAt: null, required: ["nid_front", "nid_back", "selfie"], missing: ["nid_front", "nid_back", "selfie"], complete: false };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KycUploadCard", () => {
  it("shows the required documents and the Bengali progress badge", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...stateEmpty, kyc: { nid_front: URL_OK }, missing: ["nid_back", "selfie"] }));
    render(<KycUploadCard />);
    expect(await screen.findByText("১/৩ জমা")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /KYC/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /ছবি দিন|বদলান/ })).toHaveLength(4);
    // The uploaded one opens full-size.
    expect(screen.getByRole("link", { name: /আপলোড করা ছবি/ })).toHaveAttribute("href", URL_OK);
    expect(screen.getAllByText("বাধ্যতামূলক")).toHaveLength(2);
    expect(screen.getByText("ঐচ্ছিক")).toBeInTheDocument();
  });

  it("uploads through sign → Cloudinary → save and updates the badge", async () => {
    fetchMock
      .mockResolvedValueOnce(json(stateEmpty))
      .mockResolvedValueOnce(json({ cloudName: "demo", apiKey: "k", timestamp: 1, folder: "prosanti/rider-kyc", signature: "s", uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload" }))
      .mockResolvedValueOnce(json({ secure_url: URL_OK }))
      .mockResolvedValueOnce(json({ ...stateEmpty, kyc: { nid_front: URL_OK }, missing: ["nid_back", "selfie"] }));
    render(<KycUploadCard />);
    await screen.findByText("০/৩ জমা");

    const input = screen.getByLabelText(/সামনের দিক — ছবি বেছে নিন/);
    const file = new File(["img"], "nid.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("১/৩ জমা")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/ছবি জমা হয়েছে/);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/rider/kyc/sign");
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    const [saveUrl, saveInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(saveUrl).toBe("/api/rider/kyc");
    expect(JSON.parse(String(saveInit.body))).toEqual({ doc: "nid_front", url: URL_OK });
  });

  it("explains when uploads are not configured yet, without losing the application", async () => {
    fetchMock
      .mockResolvedValueOnce(json(stateEmpty))
      .mockResolvedValueOnce(json({ error: "ছবি আপলোড এখনো কনফিগার করা হয়নি — আবেদন জমা আছে, কাগজপত্র পরে দিলেও চলবে।", code: "NOT_CONFIGURED" }, 503));
    render(<KycUploadCard />);
    await screen.findByText("০/৩ জমা");
    fireEvent.change(screen.getByLabelText(/সেলফি.*ছবি বেছে নিন/), {
      target: { files: [new File(["img"], "me.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/আবেদন জমা আছে/));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses non-image files before touching the network", async () => {
    fetchMock.mockResolvedValueOnce(json(stateEmpty));
    render(<KycUploadCard />);
    await screen.findByText("০/৩ জমা");
    fireEvent.change(screen.getByLabelText(/পেছনের দিক — ছবি বেছে নিন/), {
      target: { files: [new File(["pdf"], "nid.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/JPG\/PNG/));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
