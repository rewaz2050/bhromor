import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  db: null as null | {
    __customers: Record<string, unknown>[];
    __sessions: Record<string, unknown>[];
    from: (t: string) => unknown;
  },
  serviceConfigured: true,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => state.db,
  getSupabaseServer: async () => state.db,
}));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => state.serviceConfigured,
  isSupabaseConfigured: () => state.serviceConfigured,
  isCloudinaryConfigured: () => false,
}));

import { hashPassword } from "@/lib/customer-auth";
import { GET as meGet, } from "@/app/api/account/me/route";
import { POST as signupPost } from "@/app/api/account/signup/route";
import { POST as loginPost } from "@/app/api/account/login/route";
import { POST as logoutPost } from "@/app/api/account/logout/route";
import { GET as cardGet } from "@/app/api/account/card/route";

const makeDb = () => {
  const customers: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const findCustomer = (phone: unknown) =>
    customers.find((c) => c.phone === phone) ?? null;
  const db = {
    __customers: customers,
    __sessions: sessions,
    from(table: string) {
      const rows = table === "customers" ? customers : sessions;
      const chain = {
        _eq: undefined as unknown,
        select: () => chain,
        eq: (_col: string, val: unknown) => {
          chain._eq = val;
          return chain;
        },
        // customerStoreReady probes with .select(...).limit(1)
        limit: async () => ({ data: [] as unknown[], error: null }),
        maybeSingle: async () => {
          if (table === "customers") {
            return { data: findCustomer(chain._eq), error: null };
          }
          const row = sessions.find((s) => s.token === chain._eq) ?? null;
          if (!row) return { data: null, error: null };
          return {
            data: {
              expires_at: row.expires_at,
              customers: customers.find((c) => c.id === row.customer_id) ?? null,
            },
            error: null,
          };
        },
        single: async () => ({ data: chain._inserted, error: null }),
        _inserted: null as unknown,
        insert: (input: Record<string, unknown>) => {
          const row = table === "customers"
            ? { id: `cust-${customers.length + 1}`, ...input }
            : { ...input };
          chain._inserted = row;
          rows.push(row);
          return chain;
        },
        delete: () => ({
          eq: (_col: string, val: string) => {
            const i = sessions.findIndex((s) => s.token === val);
            if (i >= 0) sessions.splice(i, 1);
            return { error: null };
          },
        }),
      };
      return chain;
    },
  };
  return db;
};

const send = (path: string, body: unknown, cookie?: string): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie?: string): Request =>
  new Request(`http://localhost${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });

const signupCookie = async (phone = "01712345678"): Promise<string> => {
  const res = await signupPost(send("/api/account/signup", {
    name: "রহিম উদ্দিন",
    phone,
    password: "secret123",
  }));
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  return `ps_customer=${setCookie.split(";")[0].split("=")[1]}`;
};

beforeEach(() => {
  state.db = makeDb();
  state.serviceConfigured = true;
});

describe("customer account routes — no verification, instant session", () => {
  it("signup creates the account AND the session cookie in one step", async () => {
    const res = await signupPost(send("/api/account/signup", {
      name: "রহিম উদ্দিন",
      phone: "01712345678",
      password: "secret123",
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { customer: { name: string; phone: string } };
    expect(body.customer.phone).toBe("01712345678");
    expect(res.headers.get("Set-Cookie") ?? "").toContain("ps_customer=");
    expect((res.headers.get("Set-Cookie") ?? "")).toContain("HttpOnly");
    // No verification step exists anywhere in the contract:
    expect(body.customer).not.toHaveProperty("confirmation");
  });

  it("signup rejects duplicate phone and invalid input", async () => {
    await signupPost(send("/api/account/signup", {
      name: "রহিম",
      phone: "01712345678",
      password: "secret123",
    }));
    const dup = await signupPost(send("/api/account/signup", {
      name: "দ্বিতীয় জন",
      phone: "+8801712345678",
      password: "secret123",
    }));
    expect(dup.status).toBe(409);
    const badPhone = await signupPost(send("/api/account/signup", {
      name: "করিম",
      phone: "12345",
      password: "secret123",
    }));
    expect(badPhone.status).toBe(422);
    const shortPw = await signupPost(send("/api/account/signup", {
      name: "করিম",
      phone: "01812345678",
      password: "123",
    }));
    expect(shortPw.status).toBe(422);
  });

  it("login works with the password right after signup — wrong password 401s", async () => {
    state.db!.__customers.push({
      id: "c1",
      name: "রহিম",
      phone: "01712345678",
      password_hash: hashPassword("secret123"),
    });
    const ok = await loginPost(send("/api/account/login", {
      phone: "01712345678",
      password: "secret123",
    }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Set-Cookie") ?? "").toContain("ps_customer=");
    const bad = await loginPost(send("/api/account/login", {
      phone: "01712345678",
      password: "wrong!",
    }));
    expect(bad.status).toBe(401);
    const unknown = await loginPost(send("/api/account/login", {
      phone: "01900000000",
      password: "whatever",
    }));
    expect(unknown.status).toBe(401);
  });

  it("me resolves the cookie session; without cookie 401; logout clears", async () => {
    const noSession = await meGet(get("/api/account/me"));
    expect(noSession.status).toBe(401);

    const cookie = await signupCookie();
    const authed = await meGet(get("/api/account/me", cookie));
    expect(authed.status).toBe(200);
    const body = (await authed.json()) as { customer: { phone: string } };
    expect(body.customer.phone).toBe("01712345678");

    const out = await logoutPost(send("/api/account/logout", {}, cookie));
    expect(out.status).toBe(200);
    expect(out.headers.get("Set-Cookie") ?? "").toContain("Max-Age=0");
    expect(state.db!.__sessions).toHaveLength(0);
    const after = await meGet(get("/api/account/me", cookie));
    expect(after.status).toBe(401);
  });

  it("card returns server-computed stamps; prize revealed after the first order", async () => {
    const cookie = await signupCookie("01812345678");
    // 3 prior non-cancelled orders on this account phone
    const countMock = await vi
      .importActual<typeof import("@/lib/db/orders")>("@/lib/db/orders")
      .then(() => null);
    void countMock;
    const mod = await import("@/lib/db/orders");
    const spy = vi
      .spyOn(mod, "countOrdersForPhone")
      .mockResolvedValue(3);
    const res = await cardGet(get("/api/account/card", cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      card: { stamps: number; target: number; revealed: boolean; unlocked: boolean };
    };
    expect(spy).toHaveBeenCalledWith(expect.anything(), "01812345678");
    expect(body.card.stamps).toBe(3);
    expect(body.card.target).toBe(10);
    expect(body.card.revealed).toBe(true);
    expect(body.card.unlocked).toBe(false);
    spy.mockRestore();

    // 0 stamps → prize still a surprise
    const fresh = await signupCookie("01912345678");
    const spy0 = vi
      .spyOn(mod, "countOrdersForPhone")
      .mockResolvedValue(0);
    const res0 = await cardGet(get("/api/account/card", fresh));
    const body0 = (await res0.json()) as { card: { revealed: boolean } };
    expect(body0.card.revealed).toBe(false);
    spy0.mockRestore();
  });

  it("no Supabase keys → demoMode contract", async () => {
    state.serviceConfigured = false;
    const res = await signupPost(send("/api/account/signup", {
      name: "করিম",
      phone: "01712345678",
      password: "secret123",
    }));
    const body = (await res.json()) as { demoMode?: boolean };
    expect(body.demoMode).toBe(true);
    expect((await meGet(get("/api/account/me"))).headers.get("Set-Cookie")).toBeNull();
  });
});

describe("customer account routes — accounts store never migrated (42P01)", () => {
  /** A db double whose every read/write reports the relation is missing. */
  const missingRelation = { code: "42P01", message: 'relation "public.customers" does not exist' };
  const brokenDb = {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        insert: () => chain,
        maybeSingle: async () => ({ data: null, error: missingRelation }),
        single: async () => ({ data: null, error: missingRelation }),
        limit: async () => ({ data: null, error: missingRelation }),
      };
      return chain;
    },
  };

  beforeEach(() => {
    // Keys ARE configured — only the tables are missing (the go-live gap).
    state.serviceConfigured = true;
    state.db = brokenDb as unknown as typeof state.db;
  });

  it("signup degrades to demoMode (customer gets a local account, no 500)", async () => {
    const res = await signupPost(send("/api/account/signup", {
      name: "রহিম",
      phone: "01712345678",
      password: "secret123",
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ demoMode: true });
  });

  it("login degrades to demoMode for the same reason", async () => {
    const res = await loginPost(send("/api/account/login", {
      phone: "01712345678",
      password: "secret123",
    }));
    expect(await res.json()).toEqual({ demoMode: true });
  });

  it("me answers demoMode, not a live 401 — the panel must leave live mode", async () => {
    const res = await meGet(get("/api/account/me"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ demoMode: true });
  });
});
