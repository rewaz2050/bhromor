import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ mode: 0 as unknown, sent: [] as unknown[], failGet: false, failSend: false, list: null as unknown }));
vi.mock("@/lib/admin-api", () => ({
  apiGet: async (path: string) => {
    if (state.failGet) throw new Error("nope");
    return path.includes("failed-proof") && state.list ? state.list : { mode: state.mode };
  },
  apiSend: async (_p: string, _m: string, body: { mode: number }) => {
    if (state.failSend) throw new Error("denied");
    state.sent.push(body);
    return { mode: body.mode };
  },
  apiErrorMessage: () => "Could not do that.",
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import FailedProofCard from "../failed-proof-card";
import FailedProofPanel from "../failed-proof-panel";

beforeEach(() => {
  state.mode = 0;
  state.sent = [];
  state.failGet = false;
  state.failSend = false;
  state.list = null;
});
afterEach(cleanup);

describe("<FailedProofCard>", () => {
  it("shows the saved mode (off by default) and saves a new one", async () => {
    render(<FailedProofCard />);
    const off = (await screen.findAllByRole("radio"))[0] as HTMLInputElement;
    expect(off.checked).toBe(true);
    fireEvent.click(screen.getAllByRole("radio")[2]);
    await waitFor(() => expect(state.sent).toEqual([{ mode: 2 }]));
    await waitFor(() => expect((screen.getAllByRole("radio")[2] as HTMLInputElement).checked).toBe(true));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });
  it("shows an error when the save is refused", async () => {
    state.failSend = true;
    render(<FailedProofCard />);
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not do that.");
  });
});

describe("<FailedProofPanel>", () => {
  it("shows the photo and the 'no photo' note", async () => {
    state.list = {
      ready: true,
      proofs: [
        { id: "1", at: "2026-10-03T06:00:00Z", photoUrl: "https://res.cloudinary.com/c/door.jpg", noPhotoNote: null },
        { id: "2", at: "2026-10-03T05:00:00Z", photoUrl: null, noPhotoNote: "camera broken" },
      ],
    };
    render(<FailedProofPanel orderId="PS-1001" />);
    expect(await screen.findByAltText("Failed delivery attempt photo")).toHaveAttribute("src", "https://res.cloudinary.com/c/door.jpg");
    expect(screen.getByText(/camera broken/)).toBeInTheDocument();
  });
  it("renders nothing when there are none, when not ready, or on error", async () => {
    state.list = { ready: true, proofs: [] };
    const { container, unmount } = render(<FailedProofPanel orderId="PS-1001" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    unmount();
    state.failGet = true;
    const second = render(<FailedProofPanel orderId="PS-1001" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(second.container).toBeEmptyDOMElement();
  });
});
