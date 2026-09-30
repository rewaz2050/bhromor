/**
 * C1 (2026-09-28) — the screen where the shop hands out a key.
 *
 * What is pinned here is the honesty of that moment: the password appears
 * ONCE (there is no e-mail to fall back on), revoking asks first and says what
 * it does and does not touch, the cap is stated before it is hit, and a shop
 * cannot hand a login to "s" or to a number that is not a number.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StaffCard from "@/components/vendor/staff-card";
import { VENDOR_STAFF_MAX, type VendorStaffMember } from "@/lib/vendor-staff";

afterEach(cleanup);

const member = (over: Partial<VendorStaffMember> = {}): VendorStaffMember => ({
  userId: "staff-1",
  name: "Samina",
  handle: "01711111111",
  loginEmail: "01711111111@phone.prosanti.app",
  role: "staff",
  addedAt: Date.parse("2026-09-20T00:00:00Z"),
  ...over,
});

const owner: VendorStaffMember = {
  userId: "owner-1",
  name: "Nasreen",
  handle: "owner@shop.test",
  loginEmail: "owner@shop.test",
  role: "owner",
  isYou: true,
};

const renderCard = (
  staff: VendorStaffMember[] = [owner, member()],
  opts: { failCreate?: boolean; failRevoke?: boolean } = {},
) => {
  const onCreate = vi.fn(async (input: { name: string; login: string }) => {
    if (opts.failCreate) throw new Error("This number already has a PROSANTI login.");
    return {
      password: "kq7-2mx-9pa",
      staff: member({ userId: "staff-2", name: input.name, handle: input.login }),
    };
  });
  const onRevoke = vi.fn(async () => {
    if (opts.failRevoke) throw new Error("That login could not be revoked.");
  });
  const onResetPassword = vi.fn(async () => "zzz-9bb-3tt");
  render(
    <StaffCard staff={staff} onCreate={onCreate} onRevoke={onRevoke} onResetPassword={onResetPassword} />,
  );
  return { onCreate, onRevoke, onResetPassword };
};

const type = (id: string, value: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value } });

describe("StaffCard (C1)", () => {
  it("names everyone who can open the shop, and marks you", () => {
    renderCard();
    expect(screen.getByTestId("staff-list")).toHaveTextContent("Samina");
    expect(screen.getByTestId("staff-list")).toHaveTextContent("01711111111 (phone login)");
    expect(screen.getByTestId("staff-list")).toHaveTextContent("(you)");
    expect(screen.getByTestId("staff-slots")).toHaveTextContent(`4 of ${VENDOR_STAFF_MAX} free`);
  });

  it("offers no revoke button on the owner — an owner is not the shop's to remove", () => {
    renderCard();
    expect(screen.queryByTestId("staff-revoke-owner-1")).toBeNull();
    expect(screen.getByTestId("staff-revoke-staff-1")).toBeVisible();
  });

  it("says the roster is empty instead of showing a blank list", () => {
    renderCard([]);
    expect(screen.getByTestId("staff-list")).toHaveTextContent("Nobody yet");
  });

  it("opens a login and shows the password exactly once", async () => {
    const { onCreate } = renderCard();
    type("staff-name", "Rafiq");
    type("staff-login", "01712345678");
    fireEvent.click(screen.getByTestId("staff-add"));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({ name: "Rafiq", login: "01712345678" });
    const box = await screen.findByTestId("staff-onetime");
    expect(box).toHaveTextContent("kq7-2mx-9pa");
    expect(box).toHaveTextContent("shown once");
    expect(screen.getByTestId("staff-onetime-password")).toHaveTextContent("kq7-2mx-9pa");

    // Handed over → gone. There is no way back to it, and the screen says so.
    fireEvent.click(screen.getByTestId("staff-onetime-done"));
    expect(screen.queryByTestId("staff-onetime")).toBeNull();
  });

  it("refuses a name or login that is not one", () => {
    const { onCreate } = renderCard();
    type("staff-name", "R");
    type("staff-login", "01712345678");
    expect(screen.getByTestId("staff-add")).toBeDisabled();
    expect(screen.getByTestId("staff-hint")).toHaveTextContent("Type their name");

    type("staff-name", "Rafiq");
    type("staff-login", "12345");
    expect(screen.getByTestId("staff-hint")).toHaveTextContent(/mobile number/i);
    fireEvent.click(screen.getByTestId("staff-add"));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("blocks the add at the cap instead of failing on save", () => {
    const full = [
      owner,
      ...Array.from({ length: VENDOR_STAFF_MAX }, (_, i) =>
        member({ userId: `s${i}`, name: `Staff ${i}` }),
      ),
    ];
    const { onCreate } = renderCard(full);
    expect(screen.getByTestId("staff-add")).toBeDisabled();
    expect(screen.getByTestId("staff-full")).toHaveTextContent(`All ${VENDOR_STAFF_MAX} staff logins are taken`);
    type("staff-name", "Rafiq");
    type("staff-login", "01712345678");
    fireEvent.click(screen.getByTestId("staff-add"));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("asks before revoking, and says what revoking does not touch", async () => {
    const { onRevoke } = renderCard();
    fireEvent.click(screen.getByTestId("staff-revoke-staff-1"));
    expect(onRevoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("staff-revoke-yes-staff-1"));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith("staff-1"));
    expect(screen.getByTestId("staff-card")).toHaveTextContent("the person's PROSANTI login");
  });

  it("lets the owner keep a login after thinking twice", () => {
    const { onRevoke } = renderCard();
    fireEvent.click(screen.getByTestId("staff-revoke-staff-1"));
    fireEvent.click(screen.getByText("Keep"));
    expect(onRevoke).not.toHaveBeenCalled();
    expect(screen.getByTestId("staff-revoke-staff-1")).toBeVisible();
  });

  it("shows a new one-time password when one is forgotten", async () => {
    const { onResetPassword } = renderCard();
    fireEvent.click(screen.getByTestId("staff-password-staff-1"));
    await waitFor(() => expect(onResetPassword).toHaveBeenCalledWith("staff-1"));
    expect(await screen.findByTestId("staff-onetime")).toHaveTextContent("zzz-9bb-3tt");
  });

  it("reports a refusal instead of pretending the login was opened", async () => {
    renderCard([owner], { failCreate: true });
    type("staff-name", "Rafiq");
    type("staff-login", "01712345678");
    fireEvent.click(screen.getByTestId("staff-add"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("already has a PROSANTI login"));
    expect(screen.queryByTestId("staff-onetime")).toBeNull();
  });

  it("reports a revoke the server refused", async () => {
    renderCard([owner, member()], { failRevoke: true });
    fireEvent.click(screen.getByTestId("staff-revoke-staff-1"));
    fireEvent.click(screen.getByTestId("staff-revoke-yes-staff-1"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be revoked"));
  });
});
