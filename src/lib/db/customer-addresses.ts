/**
 * The server half of the address book (202610110001).
 *
 * The browser copy stays the working store — checkout reads it synchronously
 * and has to keep working with no session and no network. This is the mirror
 * that follows a customer between devices, so every function here is written
 * to fail quietly: an unmigrated table or a dropped request must never stop an
 * order. Callers get a named reason instead of an exception.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedAddress } from "@/lib/address-book";

export const ADDRESSES_TABLE = "customer_addresses";

/** How many addresses one customer keeps — the same cap the local store uses. */
export const ADDRESS_CAP = 5;

export type AddressWriteOutcome =
  | "saved"
  /** `202610110001_customer_addresses.sql` has not been run — named, not silent. */
  | "missing_table"
  | "error";

const missingTable = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === "42P01" || /does not exist/i.test(error?.message ?? "");

interface AddressRow {
  client_id: string;
  preferred: boolean;
  payload: SavedAddress;
  created_at: string;
  updated_at: string;
}

/** Newest first, the preferred address at the front. */
export const listAddresses = async (
  db: SupabaseClient,
  phone: string,
): Promise<{ addresses: SavedAddress[]; reason?: AddressWriteOutcome }> => {
  const { data, error } = await db
    .from(ADDRESSES_TABLE)
    .select("client_id, preferred, payload, created_at, updated_at")
    .eq("customer_phone", phone)
    .order("preferred", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { addresses: [], reason: missingTable(error) ? "missing_table" : "error" };
  return {
    addresses: ((data ?? []) as unknown as AddressRow[]).map((row) => row.payload),
  };
};

/**
 * Insert or replace one address, keyed by the id the browser already uses.
 * Passing `preferred` promotes it and demotes the rest — the partial unique
 * index allows only one, so the demotion has to happen first.
 */
export const upsertAddress = async (
  db: SupabaseClient,
  phone: string,
  address: SavedAddress,
  preferred = false,
): Promise<AddressWriteOutcome> => {
  if (preferred) {
    const { error } = await db
      .from(ADDRESSES_TABLE)
      .update({ preferred: false, updated_at: new Date().toISOString() })
      .eq("customer_phone", phone);
    if (error) return missingTable(error) ? "missing_table" : "error";
  }
  const { error } = await db.from(ADDRESSES_TABLE).upsert(
    {
      customer_phone: phone,
      client_id: address.id,
      preferred,
      payload: address,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "customer_phone,client_id" },
  );
  if (error) return missingTable(error) ? "missing_table" : "error";
  await trimAddresses(db, phone);
  return "saved";
};

export const removeAddressRow = async (
  db: SupabaseClient,
  phone: string,
  clientId: string,
): Promise<AddressWriteOutcome> => {
  const { error } = await db
    .from(ADDRESSES_TABLE)
    .delete()
    .eq("customer_phone", phone)
    .eq("client_id", clientId);
  if (error) return missingTable(error) ? "missing_table" : "error";
  return "saved";
};

export const preferAddressRow = async (
  db: SupabaseClient,
  phone: string,
  clientId: string,
): Promise<AddressWriteOutcome> => {
  const { error: cleared } = await db
    .from(ADDRESSES_TABLE)
    .update({ preferred: false, updated_at: new Date().toISOString() })
    .eq("customer_phone", phone);
  if (cleared) return missingTable(cleared) ? "missing_table" : "error";
  const { error } = await db
    .from(ADDRESSES_TABLE)
    .update({ preferred: true, updated_at: new Date().toISOString() })
    .eq("customer_phone", phone)
    .eq("client_id", clientId);
  if (error) return missingTable(error) ? "missing_table" : "error";
  return "saved";
};

/** The local store keeps 5 and so does this — oldest goes first. */
const trimAddresses = async (db: SupabaseClient, phone: string): Promise<void> => {
  const { data } = await db
    .from(ADDRESSES_TABLE)
    .select("client_id, preferred")
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { client_id: string; preferred: boolean }[];
  const extra = rows.slice(ADDRESS_CAP).filter((r) => !r.preferred).map((r) => r.client_id);
  if (extra.length === 0) return;
  await db.from(ADDRESSES_TABLE).delete().eq("customer_phone", phone).in("client_id", extra);
};

/**
 * Replace a customer's whole set with the list a device just sent — the shape
 * the client sync actually needs, since the browser copy is the working store
 * and this table only has to end up matching it. The first entry is the
 * preferred one, exactly as the local store orders them.
 */
export const replaceAddresses = async (
  db: SupabaseClient,
  phone: string,
  addresses: SavedAddress[],
): Promise<AddressWriteOutcome> => {
  const keep = addresses.slice(0, ADDRESS_CAP);
  const { error: cleared } = await db
    .from(ADDRESSES_TABLE)
    .update({ preferred: false })
    .eq("customer_phone", phone);
  if (cleared) return missingTable(cleared) ? "missing_table" : "error";
  for (const [index, address] of keep.entries()) {
    const outcome = await upsertAddress(db, phone, address, index === 0);
    if (outcome !== "saved") return outcome;
  }
  // Drop what this device no longer has. An empty list means "I have none",
  // which is a real state — say it plainly rather than building a filter that
  // happens to match everything.
  let query = db.from(ADDRESSES_TABLE).delete().eq("customer_phone", phone);
  if (keep.length > 0) {
    query = query.not("client_id", "in", `(${keep.map((a) => a.id).join(",")})`);
  }
  const { error } = await query;
  if (error) return missingTable(error) ? "missing_table" : "error";
  return "saved";
};
