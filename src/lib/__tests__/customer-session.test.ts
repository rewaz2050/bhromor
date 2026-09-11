import { beforeEach, describe, expect, it } from "vitest";
import {
  demoLogin,
  demoLogout,
  demoSignup,
  getCustomerSnapshot,
  subscribeCustomerAuth,
} from "../customer-session";

beforeEach(() => {
  window.localStorage.clear();
  demoLogout();
});

describe("demo customer store — instant, verification-free", () => {
  it("signup creates the account and signs in immediately", async () => {
    const result = await demoSignup({
      name: "রহিম উদ্দিন",
      phone: "01712345678",
      password: "secret123",
    });
    expect(result).toEqual({ ok: true });
    const { customer } = getCustomerSnapshot();
    expect(customer?.name).toBe("রহিম উদ্দিন");
    expect(customer?.phone).toBe("01712345678");
    // session persisted for the next visit
    expect(window.localStorage.getItem("prosanti.customer-session.v1")).toContain(
      "রহিম উদ্দিন",
    );
  });

  it("rejects duplicate phone, bad phone and short passwords", async () => {
    await demoSignup({ name: "রহিম", phone: "01712345678", password: "secret123" });
    const dup = await demoSignup({
      name: "দ্বিতীয়",
      phone: "+8801712345678",
      password: "secret123",
    });
    expect(dup).toEqual({
      ok: false,
      error: "এই নম্বরে অ্যাকাউন্ট আগেই আছে — লগ ইন করুন।",
    });
    expect(
      await demoSignup({ name: "করিম", phone: "123", password: "secret123" }),
    ).toHaveProperty("ok", false);
    expect(
      await demoSignup({ name: "করিম", phone: "01812345678", password: "123" }),
    ).toHaveProperty("ok", false);
  });

  it("logs in with the right password only; wrong password keeps you out", async () => {
    await demoSignup({ name: "রহিম", phone: "01712345678", password: "secret123" });
    demoLogout();
    expect(getCustomerSnapshot().customer).toBeNull();

    const bad = await demoLogin({ phone: "01712345678", password: "wrong" });
    expect(bad).toEqual({ ok: false, error: "নম্বর বা পাসওয়ার্ড মিলছে না।" });
    expect(getCustomerSnapshot().customer).toBeNull();

    const ok = await demoLogin({ phone: "+8801712345678", password: "secret123" });
    expect(ok).toEqual({ ok: true });
    expect(getCustomerSnapshot().customer?.name).toBe("রহিম");
  });

  it("notifies subscribers on session changes", async () => {
    let events = 0;
    const unsub = subscribeCustomerAuth(() => {
      events += 1;
    });
    await demoSignup({ name: "করিম", phone: "01812345678", password: "secret123" });
    demoLogout();
    expect(events).toBe(2);
    unsub();
  });
});
