import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  login: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  configured: true,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: api.replace }),
}));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () =>
    api.configured ? { auth: { signInWithPassword: api.login } } : null,
}));
vi.mock("@/lib/use-rider", () => ({
  useRiderSession: () => ({
    status: "guest",
    error: null,
    denyReason: null,
    refresh: api.refresh,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/lib/use-poll", () => ({ usePoll: vi.fn() }));
vi.mock("@/components/auth/forgot-password-panel", () => ({
  default: () => null,
}));
vi.mock("@/components/rider/kyc-upload-card", () => ({ default: () => null }));
import RiderLoginPage from "../page";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  api.configured = true;
  api.login.mockReset().mockResolvedValue({ error: null });
  api.refresh.mockReset().mockResolvedValue(undefined);
  api.replace.mockReset();
});
afterEach(cleanup);
function form(identifier = " rider@example.com ", password = "secret12") {
  const h = render(<RiderLoginPage />);
  fireEvent.change(screen.getByLabelText("ইমেইল অ্যাড্রেস বা মোবাইল নম্বর"), {
    target: { value: identifier },
  });
  fireEvent.change(screen.getByLabelText("পাসওয়ার্ড"), {
    target: { value: password },
  });
  return {
    ...h,
    form: screen.getByRole("button", { name: "লগইন করুন" }).closest("form")!,
  };
}
it("same-batch duplicate submissions dispatch one SDK login", async () => {
  const pending = deferred<{ error: null }>();
  api.login.mockReturnValue(pending.promise);
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
    fireEvent.submit(h.form);
  });
  expect(api.login).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve({ error: null });
  });
});
it("abandoned SDK success must not start a session probe", async () => {
  const pending = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(pending.promise);
  const h = form();
  fireEvent.submit(h.form);
  h.unmount();
  await act(async () => {
    pending.resolve({ error: null });
  });
  expect(api.refresh).not.toHaveBeenCalled();
  expect(api.replace).not.toHaveBeenCalled();
});
it("current unexpected SDK rejection uses safe copy and unlocks retry", async () => {
  api.login.mockRejectedValueOnce(new Error("Private SDK transport detail"));
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "লগইন যাচাই করা যায়নি — আবার চেষ্টা করুন।",
  );
  expect(
    (screen.getByRole("button", { name: "লগইন করুন" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(api.refresh).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(api.refresh).toHaveBeenCalledTimes(1);
});
it("current probe rejection uses verification copy rather than raw error", async () => {
  api.refresh.mockRejectedValueOnce(new Error("Private session detail"));
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "লগইন যাচাই করা যায়নি — আবার চেষ্টা করুন।",
  );
  expect(api.login).toHaveBeenCalledTimes(1);
});
it("pending SDK and follow-up read keep inputs and submit disabled", async () => {
  const read = deferred<void>();
  api.refresh.mockReturnValueOnce(read.promise);
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(
    (screen.getByLabelText("পাসওয়ার্ড") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(h.form.getAttribute("aria-busy")).toBe("true");
  fireEvent.submit(h.form);
  expect(api.login).toHaveBeenCalledTimes(1);
  await act(async () => {
    read.resolve();
  });
  expect(h.form.getAttribute("aria-busy")).toBe("false");
});
it("normal email credentials and current probe are preserved", async () => {
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(api.login).toHaveBeenCalledExactlyOnceWith({
    email: "rider@example.com",
    password: "secret12",
  });
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(api.replace).not.toHaveBeenCalled();
});
it("Bangla phone identifier still maps to the synthetic email", async () => {
  const h = form("০১৭১২৩৪৫৬৭৮");
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(api.login).toHaveBeenCalledExactlyOnceWith({
    email: "01712345678@phone.prosanti.app",
    password: "secret12",
  });
});
it.each([
  ["Email not confirmed", "কনফার্ম"],
  ["Invalid login credentials", "মিলছে না"],
  ["Too many requests", "এক মিনিট"],
])("current expected SDK refusal keeps %s guidance", async (message, copy) => {
  api.login.mockResolvedValueOnce({ error: { message } });
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(screen.getByRole("alert").textContent).toContain(copy);
  expect(api.refresh).not.toHaveBeenCalled();
});
it("invalid identifier and short password still block SDK dispatch", async () => {
  const h = form("bad", "123");
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(api.login).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("ইমেইল অ্যাড্রেস বা মোবাইল নম্বর"), {
    target: { value: "rider@example.com" },
  });
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(api.login).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("৬ অক্ষর");
});
it("unconfigured SDK still shows service guidance without a request", async () => {
  api.configured = false;
  const h = form();
  await act(async () => {
    fireEvent.submit(h.form);
  });
  expect(api.login).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("লগইন সেবা");
});
it("remount has an independent lock and old success cannot probe for the new page", async () => {
  const a = deferred<{ error: null }>(),
    b = deferred<{ error: null }>();
  api.login.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const first = form();
  await act(async () => {
    fireEvent.submit(first.form);
  });
  first.unmount();
  const second = form();
  fireEvent.submit(second.form);
  await act(async () => {
    a.resolve({ error: null });
  });
  expect(api.refresh).not.toHaveBeenCalled();
  expect(second.form.getAttribute("aria-busy")).toBe("true");
  await act(async () => {
    b.resolve({ error: null });
  });
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(second.form.getAttribute("aria-busy")).toBe("false");
});
it("abandoned probe rejection cannot put an error into a new page", async () => {
  let reject!: (reason: Error) => void;
  api.refresh.mockReturnValueOnce(
    new Promise<void>((_resolve, no) => {
      reject = no;
    }),
  );
  const first = form();
  await act(async () => {
    fireEvent.submit(first.form);
  });
  first.unmount();
  const second = form();
  await act(async () => {
    reject(new Error("Old private probe detail"));
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(second.form.getAttribute("aria-busy")).toBe("false");
  await act(async () => {
    fireEvent.submit(second.form);
  });
  expect(api.refresh).toHaveBeenCalledTimes(2);
});
