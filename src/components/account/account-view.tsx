"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCustomer } from "./customer-provider";
import { useAccountWishlist } from "./account-wishlist-provider";
import {
  getWishlist,
  getWishlistServer,
  subscribeWishlist,
} from "@/lib/wishlist-store";
import { IconShield } from "@/components/ui/icons";

export default function AccountView() {
  const { client, session, loading } = useCustomer();
  const cloud = useAccountWishlist();
  const guest = useSyncExternalStore(
    subscribeWishlist,
    getWishlist,
    getWishlistServer,
  );
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const requestCode = async () => {
    if (!client || locked.current || cooldown > 0) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const address = email.trim();
      const { error } = await client.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setSentTo(address);
      setCooldown(60);
      setToken("");
      setMessage(
        "Check your inbox for a sign-in code. It may take a moment; check spam too.",
      );
    } catch {
      setError(
        "We couldn’t send a code. Check your email address, wait a moment and try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!client || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error } = await client.auth.verifyOtp({
        email: sentTo,
        token: token.trim(),
        type: "email",
      });
      if (error) throw error;
      setToken("");
    } catch {
      setError(
        "That code is invalid or expired. Try again or request a new code.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const signOut = async () => {
    if (!client || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      setError("Sign out failed. Please retry before leaving a shared device.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  if (loading)
    return (
      <p role="status" className="py-12 text-ink-soft">
        Checking your session…
      </p>
    );
  if (!client)
    return (
      <div className="border border-line bg-ivory-100 p-8">
        <h2 className="font-display text-3xl text-forest-900">
          Your favourites, for now on this device.
        </h2>
        <p className="mt-4 text-sm leading-7 text-ink-soft">
          Account sign-in isn’t connected yet. You can still shop and save
          favourites as a guest. No account is created in this preview.
        </p>
        <Link
          href="/wishlist"
          className="editorial-button mt-6 bg-forest-800 text-white"
        >
          View guest wishlist →
        </Link>
      </div>
    );

  return (
    <div className="border border-line bg-paper p-6 sm:p-10">
      {session ? (
        <>
          <p className="text-xs uppercase tracking-widest text-gold-600">
            Signed in
          </p>
          <h2 className="mt-3 break-words font-display text-2xl text-forest-900">
            {session.user.email}
          </h2>
          <p className="mt-4 text-sm leading-7 text-ink-soft">
            Your account wishlist is stored separately from this browser’s guest
            favourites. Changes refresh when you return to the tab.
          </p>
          <Link
            href="/wishlist"
            className="editorial-button mt-6 bg-forest-800 text-white"
          >
            Your wishlist ({cloud?.ids.length ?? 0}) →
          </Link>
          <div className="mt-7 border-y border-line py-6">
            <h3 className="text-sm font-semibold text-forest-900">
              Bring your guest favourites along
            </h3>
            <p className="mt-2 text-xs leading-6 text-ink-soft">
              Import {guest.length} saved{" "}
              {guest.length === 1 ? "item" : "items"} from this browser. This
              only adds to your account; it never replaces existing saved items.
              Guest favourites stay on this device.
            </p>
            <button
              type="button"
              disabled={!guest.length || !cloud?.ready || cloud.busy}
              onClick={async () => {
                setMessage("");
                if (await cloud?.importGuest())
                  setMessage("Guest favourites added to your account.");
              }}
              className="mt-3 min-h-11 text-sm font-medium text-forest-800 underline underline-offset-4 disabled:opacity-40"
            >
              {cloud?.busy ? "Syncing…" : "Import guest favourites"}
            </button>
          </div>
          {cloud?.error && (
            <div role="alert" className="mt-4 text-sm text-red-800">
              <p>{cloud.error}</p>
              <button
                disabled={cloud.busy}
                onClick={() => void cloud.refresh()}
                className="min-h-11 underline"
              >
                Retry wishlist sync
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={busy || cloud?.busy}
            onClick={() => void signOut()}
            className="mt-5 min-h-11 text-sm text-ink-soft underline disabled:opacity-40"
          >
            {busy ? "Signing out…" : "Sign out on this device"}
          </button>
        </>
      ) : (
        <>
          <IconShield className="h-7 w-7 text-gold-600" />
          <h2 className="mt-5 font-display text-3xl text-forest-900">
            Make yourself at home.
          </h2>
          <p className="mt-3 text-sm leading-7 text-ink-soft">
            Sign in or create an account with an email code. No password to
            remember.
          </p>
          {!sentTo ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void requestCode();
              }}
              className="mt-7"
            >
              <label
                htmlFor="account-email"
                className="text-sm text-forest-900"
              >
                Email address
              </label>
              <input
                id="account-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="mt-2 h-14 w-full border border-line bg-ivory-50 px-4 text-base"
              />
              <button
                disabled={busy || cooldown > 0}
                className="editorial-button mt-4 w-full bg-forest-800 text-white disabled:opacity-40"
              >
                {busy
                  ? "Sending code…"
                  : cooldown
                    ? `Try again in ${cooldown}s`
                    : "Send sign-in code"}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
              className="mt-7"
            >
              <p className="mb-4 break-words text-sm text-ink-soft">
                Code sent to {sentTo}
              </p>
              <label htmlFor="account-code" className="text-sm text-forest-900">
                Email code
              </label>
              <input
                id="account-code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                minLength={6}
                maxLength={10}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                disabled={busy}
                className="mt-2 h-14 w-full border border-line bg-ivory-50 px-4 text-xl tracking-widest"
              />
              <button
                disabled={busy}
                className="editorial-button mt-4 w-full bg-forest-800 text-white disabled:opacity-40"
              >
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              <div className="mt-3 flex flex-wrap justify-between gap-3">
                <button
                  type="button"
                  disabled={busy || cooldown > 0}
                  onClick={() => void requestCode()}
                  className="min-h-11 text-xs underline disabled:opacity-40"
                >
                  {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSentTo("");
                    setToken("");
                    setMessage("");
                    setError("");
                  }}
                  className="min-h-11 text-xs underline"
                >
                  Use another email
                </button>
              </div>
            </form>
          )}
          <p className="mt-5 text-xs leading-6 text-ink-soft">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            . Guest checkout remains available.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-5 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-5 text-sm text-forest-800">
          {message}
        </p>
      )}
    </div>
  );
}
