"use client";

/**
 * Address book sync — the browser copy meets the server copy (2026-10-11).
 *
 * localStorage stays the working store: checkout reads it synchronously, with
 * no session and no network, and must never wait on this. Everything here is
 * best effort and never throws — a signed-out shopper, an unmigrated table or
 * a dropped request all leave the local book exactly as it was.
 *
 * Convergence rule: the server's rows come first (they carry the preferred
 * order the customer set on another device), then anything this device has
 * that the server has not seen. The merged list is written locally and pushed
 * back, so whichever device spoke last leaves both sides holding the union.
 */

import { getSavedAddresses, setSavedAddresses, type SavedAddress } from "./address-book";

export type AddressSyncState = "idle" | "ok" | "signed-out" | "missing-table" | "error";

let state: AddressSyncState = "idle";

/** So the account page can say why the addresses are only on this device. */
export const addressSyncState = (): AddressSyncState => state;

const cap = (rows: SavedAddress[]): SavedAddress[] => rows.slice(0, 5);

const put = async (addresses: SavedAddress[]): Promise<boolean> => {
  const res = await fetch("/api/account/addresses", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ addresses }),
  });
  if (res.status === 401) {
    state = "signed-out";
    return false;
  }
  if (res.status === 501) {
    state = "missing-table";
    return false;
  }
  if (!res.ok) {
    state = "error";
    return false;
  }
  state = "ok";
  return true;
};

/** Push what this device has. Call after any local save or delete. */
export const pushAddresses = async (): Promise<boolean> => {
  try {
    return await put(getSavedAddresses());
  } catch {
    state = "error";
    return false;
  }
};

/**
 * Pull, merge into the local book, push the union back. Returns the list the
 * device now holds so a caller can re-render without reading storage twice.
 */
export const syncAddresses = async (): Promise<SavedAddress[]> => {
  let remote: SavedAddress[] = [];
  try {
    const res = await fetch("/api/account/addresses", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.status === 401) {
      state = "signed-out";
      return getSavedAddresses();
    }
    if (res.status === 501) {
      state = "missing-table";
      return getSavedAddresses();
    }
    if (!res.ok) {
      state = "error";
      return getSavedAddresses();
    }
    const data = (await res.json()) as { addresses?: SavedAddress[] };
    remote = Array.isArray(data.addresses) ? data.addresses : [];
  } catch {
    state = "error";
    return getSavedAddresses();
  }

  const local = getSavedAddresses();
  const byId = new Map(local.map((a) => [a.id, a]));
  const merged = cap([...remote.filter((r) => r && typeof r.id === "string"), ...local.filter((a) => !remote.some((r) => r.id === a.id))]);
  // A remote row this device already has keeps its local copy — the browser
  // book is the one checkout is about to read.
  const withLocalWins = merged.map((row) => byId.get(row.id) ?? row);
  try {
    setSavedAddresses(withLocalWins);
  } catch {
    state = "error";
    return local;
  }
  await put(withLocalWins);
  return withLocalWins;
};
